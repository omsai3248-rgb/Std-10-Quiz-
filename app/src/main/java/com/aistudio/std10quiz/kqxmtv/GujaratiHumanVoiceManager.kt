package com.aistudio.std10quiz.kqxmtv

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.PlaybackParams
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.util.Log
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.ai.GenerativeModel
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.InlineDataPart
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.ResponseModality
import com.google.firebase.ai.type.SpeechConfig
import com.google.firebase.ai.type.Voice
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.generationConfig
import com.google.firebase.storage.storage
import com.google.firebase.storage.storageMetadata
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class GujaratiHumanVoiceManager(
    context: Context,
    private val onEvent: (
        type: String,
        utteranceId: String,
        source: String?,
        errorMessage: String?
    ) -> Unit,
    private val onOfflineFallbackSpeak: (utteranceId: String, text: String, speechRate: Float) -> Unit,
    private val onStopOfflineFallback: () -> Unit
) {
    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val cacheDir = File(appContext.cacheDir, CACHE_DIR_NAME).apply { mkdirs() }

    private val ai by lazy { Firebase.ai }
    private val modelCache = ConcurrentHashMap<String, GenerativeModel>()
    private val activeSessionCounter = AtomicInteger(0)

    @Volatile
    private var currentSpeakJob: Job? = null

    @Volatile
    private var mediaPlayer: MediaPlayer? = null

    @Volatile
    private var currentUtteranceId: String = ""

    @Volatile
    private var isPausedState: Boolean = false

    @Volatile
    private var isShutDown: Boolean = false

    fun getVoiceGender(): String {
        val saved = prefs.getString(KEY_VOICE_GENDER, GENDER_FEMALE)
        return if (saved == GENDER_MALE) GENDER_MALE else GENDER_FEMALE
    }

    fun setVoiceGender(gender: String) {
        val normalized = if (gender.equals(GENDER_MALE, ignoreCase = true)) GENDER_MALE else GENDER_FEMALE
        prefs.edit().putString(KEY_VOICE_GENDER, normalized).apply()
    }

    fun speak(
        utteranceId: String,
        text: String,
        gender: String,
        tone: String,
        speechRate: Float
    ) {
        if (isShutDown) return
        val cleanText = text.trim()
        val cleanId = utteranceId.trim().ifBlank { "gu_ai_${System.currentTimeMillis()}" }
        if (cleanText.isBlank()) {
            onEvent("done", cleanId, "none", null)
            return
        }

        val normalizedGender = normalizeGender(gender)
        val normalizedTone = normalizeTone(tone)
        val clampedRate = speechRate.coerceIn(0.8f, 1.25f)
        val sessionToken = activeSessionCounter.incrementAndGet()

        currentSpeakJob?.cancel()
        stopMediaPlayerOnly()
        onStopOfflineFallback()
        currentUtteranceId = cleanId
        isPausedState = false

        currentSpeakJob = scope.launch {
            try {
                val hash = buildCacheKey(normalizedGender, normalizedTone, cleanText)
                val cachedFile = File(cacheDir, "$hash.wav")

                if (cachedFile.exists() && cachedFile.length() > WAV_HEADER_SIZE) {
                    cachedFile.setLastModified(System.currentTimeMillis())
                    if (isSessionActive(sessionToken, cleanId)) {
                        playWavFile(cachedFile, cleanId, sessionToken, clampedRate, SOURCE_LOCAL_CACHE)
                    }
                    return@launch
                }

                if (!isOnline()) {
                    if (isSessionActive(sessionToken, cleanId)) {
                        onOfflineFallbackSpeak(cleanId, cleanText, clampedRate)
                    }
                    return@launch
                }

                // Emit synthesizing state right before network lookup / Gemini generation
                if (isSessionActive(sessionToken, cleanId)) {
                    onEvent("synthesizing", cleanId, null, null)
                }

                // Tier 2: Check shared Firebase Storage audio cache
                val storageFetched = tryDownloadFromFirebaseStorage(normalizedGender, hash, cachedFile)
                if (storageFetched && cachedFile.exists() && cachedFile.length() > WAV_HEADER_SIZE) {
                    if (isSessionActive(sessionToken, cleanId)) {
                        playWavFile(cachedFile, cleanId, sessionToken, clampedRate, SOURCE_FIREBASE_STORAGE)
                    }
                    return@launch
                }

                // Tier 3: Generate fresh Human-Like Gujarati voice via Gemini TTS (Firebase AI Logic)
                val wavBytes = synthesizeWithGeminiTts(cleanText, normalizedGender, normalizedTone)
                if (wavBytes != null && wavBytes.size > WAV_HEADER_SIZE) {
                    writeCacheFileAtomically(cachedFile, wavBytes)
                    trimDiskCacheIfNeeded()

                    // Asynchronous Tier 2 backup to Firebase Storage so other devices reuse it
                    scope.launch {
                        uploadToFirebaseStorageQuietly(normalizedGender, hash, cachedFile)
                    }

                    if (isSessionActive(sessionToken, cleanId)) {
                        playWavFile(cachedFile, cleanId, sessionToken, clampedRate, SOURCE_GEMINI_AI)
                    }
                    return@launch
                }

                throw IllegalStateException("Gemini TTS returned empty audio payload.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: TimeoutCancellationException) {
                Log.e(TAG, "Gemini TTS timed out after 35s", e)
                if (isSessionActive(sessionToken, cleanId)) {
                    onOfflineFallbackSpeak(cleanId, cleanText, clampedRate)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Gemini TTS synthesis failed; falling back gracefully", e)
                if (isSessionActive(sessionToken, cleanId)) {
                    onOfflineFallbackSpeak(cleanId, cleanText, clampedRate)
                }
            }
        }
    }

    fun prefetch(text: String, gender: String, tone: String) {
        if (isShutDown) return
        val cleanText = text.trim()
        if (cleanText.isBlank()) return
        val normalizedGender = normalizeGender(gender)
        val normalizedTone = normalizeTone(tone)

        scope.launch {
            try {
                val hash = buildCacheKey(normalizedGender, normalizedTone, cleanText)
                val cachedFile = File(cacheDir, "$hash.wav")
                if (cachedFile.exists() && cachedFile.length() > WAV_HEADER_SIZE) return@launch
                if (!isOnline()) return@launch

                val downloaded = tryDownloadFromFirebaseStorage(normalizedGender, hash, cachedFile)
                if (downloaded && cachedFile.exists() && cachedFile.length() > WAV_HEADER_SIZE) {
                    return@launch
                }

                val wavBytes = synthesizeWithGeminiTts(cleanText, normalizedGender, normalizedTone)
                if (wavBytes != null && wavBytes.size > WAV_HEADER_SIZE) {
                    writeCacheFileAtomically(cachedFile, wavBytes)
                    trimDiskCacheIfNeeded()
                    uploadToFirebaseStorageQuietly(normalizedGender, hash, cachedFile)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Prefetch skipped: ${e.message}")
            }
        }
    }

    fun pause() {
        val uttId = currentUtteranceId
        if (uttId.isBlank()) return
        runCatching {
            val mp = mediaPlayer
            if (mp != null && mp.isPlaying) {
                mp.pause()
                isPausedState = true
                onEvent("pause", uttId, null, null)
            }
        }.onFailure { err ->
            Log.w(TAG, "Pause failed", err)
        }
    }

    fun resume() {
        val uttId = currentUtteranceId
        if (uttId.isBlank()) return
        runCatching {
            val mp = mediaPlayer
            if (mp != null && isPausedState) {
                mp.start()
                isPausedState = false
                onEvent("resume", uttId, null, null)
            }
        }.onFailure { err ->
            Log.w(TAG, "Resume failed", err)
        }
    }

    fun stop() {
        activeSessionCounter.incrementAndGet()
        currentUtteranceId = ""
        isPausedState = false
        currentSpeakJob?.cancel()
        currentSpeakJob = null
        stopMediaPlayerOnly()
    }

    fun shutdown() {
        isShutDown = true
        stop()
        scope.cancel()
    }

    private fun isSessionActive(sessionToken: Int, utteranceId: String): Boolean {
        return !isShutDown &&
            activeSessionCounter.get() == sessionToken &&
            currentUtteranceId == utteranceId
    }

    private fun normalizeGender(gender: String): String {
        return if (gender.equals(GENDER_MALE, ignoreCase = true)) GENDER_MALE else GENDER_FEMALE
    }

    private fun normalizeTone(tone: String): String {
        return when (tone.lowercase()) {
            TONE_CORRECT -> TONE_CORRECT
            TONE_WRONG -> TONE_WRONG
            else -> TONE_EXPLANATION
        }
    }

    private fun resolveVoiceName(gender: String): String {
        return if (gender == GENDER_MALE) VOICE_MALE else VOICE_FEMALE
    }

    private fun buildSystemPrompt(tone: String): String {
        return when (tone) {
            TONE_CORRECT -> """
                You are an affectionate, enthusiastic Gujarati school teacher celebrating with a Std 10 student who just answered a quiz question correctly.
                Read aloud ONLY the exact Gujarati sentence given in the user message, word for word, in natural, crystal-clear native Gujarati (gu-IN).
                Sound genuinely joyful, proud, warm, and conversational with lively human intonation and natural pauses — never robotic or flat.
                Do NOT add any extra words, greetings, commentary, or English translation.
            """.trimIndent()

            TONE_WRONG -> """
                You are a kind, caring Gujarati school teacher gently encouraging a Std 10 student who got a quiz answer wrong.
                Read aloud ONLY the exact Gujarati sentence given in the user message, word for word, in natural, crystal-clear native Gujarati (gu-IN).
                Sound warm, empathetic, reassuring, and supportive with a gentle human cadence and natural breathing pauses — never harsh or robotic.
                Do NOT add any extra words, commentary, or English translation.
            """.trimIndent()

            else -> """
                You are an experienced, patient Std 10 Gujarati medium school teacher explaining a concept clearly in class.
                Read aloud ONLY the exact Gujarati text given in the user message, word for word, in clear, fluent native Gujarati (gu-IN).
                Pronounce Gujarati, Science, and Maths terms cleanly, keep a warm conversational teacher voice, emphasize key points naturally, and pause briefly at commas, colons, and full stops.
                Do NOT add extra words, greetings, or English translation.
            """.trimIndent()
        }
    }

    @OptIn(PublicPreviewAPI::class)
    private fun getOrCreateTtsModel(gender: String, tone: String): GenerativeModel {
        val voiceName = resolveVoiceName(gender)
        val cacheKey = "${voiceName}_$tone"
        return modelCache.getOrPut(cacheKey) {
            val config = generationConfig {
                responseModalities = listOf(ResponseModality.AUDIO)
                speechConfig = SpeechConfig(
                    voice = Voice(voiceName),
                    languageCode = "gu-IN"
                )
            }
            ai.generativeModel(
                modelName = TTS_MODEL_NAME,
                generationConfig = config,
                systemInstruction = content { text(buildSystemPrompt(tone)) }
            )
        }
    }

    private suspend fun synthesizeWithGeminiTts(
        text: String,
        gender: String,
        tone: String
    ): ByteArray? {
        if (FirebaseApp.getApps(appContext).isEmpty()) {
            FirebaseApp.initializeApp(appContext)
        }
        val model = getOrCreateTtsModel(gender, tone)
        val response = withTimeout(35_000L) {
            model.generateContent(content { text(text) })
        }

        val audioBuffer = ByteArrayOutputStream()
        var detectedMime = "audio/L16;codec=pcm;rate=24000"

        for (candidate in response.candidates) {
            for (part in candidate.content.parts) {
                if (part is InlineDataPart && part.inlineData.isNotEmpty()) {
                    if (part.mimeType.isNotBlank()) {
                        detectedMime = part.mimeType
                    }
                    audioBuffer.write(part.inlineData)
                }
            }
        }

        val rawBytes = audioBuffer.toByteArray()
        if (rawBytes.isEmpty()) return null

        return ensurePlayableWavBytes(rawBytes, detectedMime)
    }

    private fun ensurePlayableWavBytes(rawBytes: ByteArray, mimeType: String): ByteArray {
        val hasRiffHeader = rawBytes.size >= 12 &&
            rawBytes[0] == 'R'.code.toByte() &&
            rawBytes[1] == 'I'.code.toByte() &&
            rawBytes[2] == 'F'.code.toByte() &&
            rawBytes[3] == 'F'.code.toByte()
        if (hasRiffHeader || mimeType.contains("wav", ignoreCase = true)) {
            if (hasRiffHeader) return rawBytes
        }

        val sampleRate = Regex("rate=(\\d+)", RegexOption.IGNORE_CASE)
            .find(mimeType)
            ?.groupValues
            ?.getOrNull(1)
            ?.toIntOrNull()
            ?.takeIf { it in 8000..48000 }
            ?: DEFAULT_PCM_SAMPLE_RATE

        return wrapPcm16MonoAsWav(rawBytes, sampleRate)
    }

    private fun wrapPcm16MonoAsWav(pcmBytes: ByteArray, sampleRate: Int): ByteArray {
        val channels = 1
        val bitsPerSample = 16
        val byteRate = sampleRate * channels * bitsPerSample / 8
        val blockAlign = channels * bitsPerSample / 8
        val dataSize = pcmBytes.size
        val chunkSize = 36 + dataSize

        val header = ByteBuffer.allocate(WAV_HEADER_SIZE).order(ByteOrder.LITTLE_ENDIAN)
        header.put('R'.code.toByte())
        header.put('I'.code.toByte())
        header.put('F'.code.toByte())
        header.put('F'.code.toByte())
        header.putInt(chunkSize)
        header.put('W'.code.toByte())
        header.put('A'.code.toByte())
        header.put('V'.code.toByte())
        header.put('E'.code.toByte())
        header.put('f'.code.toByte())
        header.put('m'.code.toByte())
        header.put('t'.code.toByte())
        header.put(' '.code.toByte())
        header.putInt(16) // Subchunk1Size for PCM
        header.putShort(1.toShort()) // AudioFormat = 1 (PCM)
        header.putShort(channels.toShort())
        header.putInt(sampleRate)
        header.putInt(byteRate)
        header.putShort(blockAlign.toShort())
        header.putShort(bitsPerSample.toShort())
        header.put('d'.code.toByte())
        header.put('a'.code.toByte())
        header.put('t'.code.toByte())
        header.put('a'.code.toByte())
        header.putInt(dataSize)

        val out = ByteArray(WAV_HEADER_SIZE + dataSize)
        System.arraycopy(header.array(), 0, out, 0, WAV_HEADER_SIZE)
        System.arraycopy(pcmBytes, 0, out, WAV_HEADER_SIZE, dataSize)
        return out
    }

    private suspend fun tryDownloadFromFirebaseStorage(
        gender: String,
        hash: String,
        targetFile: File
    ): Boolean {
        return runCatching {
            val tmpFile = File(cacheDir, "$hash.dl.tmp")
            val storageRef = Firebase.storage.reference.child("voice_cache/$gender/$hash.wav")
            val ok = withTimeoutOrNull(4_500L) {
                suspendCancellableCoroutine<Boolean> { cont ->
                    val task = storageRef.getFile(tmpFile)
                    task.addOnSuccessListener {
                        if (cont.isActive) cont.resume(true)
                    }
                    task.addOnFailureListener {
                        if (cont.isActive) cont.resume(false)
                    }
                    cont.invokeOnCancellation {
                        runCatching { task.cancel() }
                        runCatching { tmpFile.delete() }
                    }
                }
            } ?: false

            if (ok && tmpFile.exists() && tmpFile.length() > WAV_HEADER_SIZE) {
                if (targetFile.exists()) targetFile.delete()
                tmpFile.renameTo(targetFile)
                true
            } else {
                tmpFile.delete()
                false
            }
        }.getOrDefault(false)
    }

    private suspend fun uploadToFirebaseStorageQuietly(
        gender: String,
        hash: String,
        wavFile: File
    ) {
        if (!wavFile.exists() || wavFile.length() <= WAV_HEADER_SIZE || !isOnline()) return
        runCatching {
            val storageRef = Firebase.storage.reference.child("voice_cache/$gender/$hash.wav")
            val metadata = storageMetadata {
                contentType = "audio/wav"
                cacheControl = "public,max-age=31536000"
            }
            withTimeoutOrNull(12_000L) {
                suspendCancellableCoroutine<Unit> { cont ->
                    val task = storageRef.putFile(Uri.fromFile(wavFile), metadata)
                    task.addOnSuccessListener {
                        if (cont.isActive) cont.resume(Unit)
                    }
                    task.addOnFailureListener { err ->
                        Log.w(TAG, "Storage cache upload skipped: ${err.message}")
                        if (cont.isActive) cont.resume(Unit)
                    }
                    cont.invokeOnCancellation {
                        runCatching { task.cancel() }
                    }
                }
            }
        }
    }

    private suspend fun playWavFile(
        file: File,
        utteranceId: String,
        sessionToken: Int,
        speechRate: Float,
        source: String
    ) {
        withContext(Dispatchers.Main) {
            if (!isSessionActive(sessionToken, utteranceId)) return@withContext
            stopMediaPlayerOnly()

            val player = MediaPlayer()
            mediaPlayer = player
            try {
                player.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                player.setDataSource(file.absolutePath)
                player.prepare()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && speechRate != 1.0f) {
                    runCatching {
                        player.playbackParams = PlaybackParams().setSpeed(speechRate)
                    }
                }
                player.setOnCompletionListener {
                    if (mediaPlayer === player) {
                        stopMediaPlayerOnly()
                    }
                    if (isSessionActive(sessionToken, utteranceId)) {
                        currentUtteranceId = ""
                        isPausedState = false
                        onEvent("done", utteranceId, source, null)
                    }
                }
                player.setOnErrorListener { _, what, extra ->
                    Log.e(TAG, "MediaPlayer playback error what=$what extra=$extra")
                    if (mediaPlayer === player) {
                        stopMediaPlayerOnly()
                    }
                    if (isSessionActive(sessionToken, utteranceId)) {
                        currentUtteranceId = ""
                        isPausedState = false
                        onEvent("error", utteranceId, source, "Audio playback error ($what)")
                    }
                    true
                }
                if (!isSessionActive(sessionToken, utteranceId)) {
                    stopMediaPlayerOnly()
                    return@withContext
                }
                player.start()
                onEvent("start", utteranceId, source, null)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start MediaPlayer for cached wav", e)
                stopMediaPlayerOnly()
                if (isSessionActive(sessionToken, utteranceId)) {
                    currentUtteranceId = ""
                    onEvent("error", utteranceId, source, e.localizedMessage)
                }
            }
        }
    }

    private fun stopMediaPlayerOnly() {
        val player = mediaPlayer
        mediaPlayer = null
        if (player != null) {
            runCatching {
                if (player.isPlaying) player.stop()
            }
            runCatching { player.reset() }
            runCatching { player.release() }
        }
    }

    private fun writeCacheFileAtomically(targetFile: File, bytes: ByteArray) {
        val tmpFile = File(cacheDir, "${targetFile.name}.${System.currentTimeMillis()}.tmp")
        tmpFile.writeBytes(bytes)
        if (targetFile.exists()) targetFile.delete()
        tmpFile.renameTo(targetFile)
    }

    private fun trimDiskCacheIfNeeded() {
        runCatching {
            val files = cacheDir.listFiles()?.filter { it.isFile && it.name.endsWith(".wav") } ?: return
            var totalBytes = files.sumOf { it.length() }
            if (totalBytes <= MAX_CACHE_BYTES) return

            val sortedOldestFirst = files.sortedBy { it.lastModified() }
            for (f in sortedOldestFirst) {
                if (totalBytes <= TARGET_CACHE_BYTES_AFTER_TRIM) break
                val len = f.length()
                if (f.delete()) {
                    totalBytes -= len
                }
            }
        }
    }

    private fun buildCacheKey(gender: String, tone: String, text: String): String {
        val input = "v2|$gender|$tone|$text"
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun isOnline(): Boolean {
        return runCatching {
            val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return@runCatching true
            val network = cm.activeNetwork ?: return@runCatching false
            val caps = cm.getNetworkCapabilities(network) ?: return@runCatching false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && (
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ||
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
                )
        }.getOrDefault(true)
    }

    companion object {
        private const val TAG = "GujaratiHumanVoice"
        private const val TTS_MODEL_NAME = "gemini-3.1-flash-tts-preview"
        private const val VOICE_FEMALE = "Kore"
        private const val VOICE_MALE = "Charon"
        private const val GENDER_FEMALE = "female"
        private const val GENDER_MALE = "male"
        private const val TONE_CORRECT = "feedback_correct"
        private const val TONE_WRONG = "feedback_wrong"
        private const val TONE_EXPLANATION = "explanation"

        private const val SOURCE_LOCAL_CACHE = "local_cache"
        private const val SOURCE_FIREBASE_STORAGE = "firebase_storage"
        private const val SOURCE_GEMINI_AI = "gemini_ai"

        private const val PREFS_NAME = "std10_voice_prefs"
        private const val KEY_VOICE_GENDER = "voice_gender"
        private const val CACHE_DIR_NAME = "gujarati_voice_cache"
        private const val WAV_HEADER_SIZE = 44
        private const val DEFAULT_PCM_SAMPLE_RATE = 24000
        private const val MAX_CACHE_BYTES = 60L * 1024L * 1024L
        private const val TARGET_CACHE_BYTES_AFTER_TRIM = 45L * 1024L * 1024L
    }
}
