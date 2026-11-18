package com.aistudio.std10quiz.kqxmtv

import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.ComponentActivity
import org.json.JSONObject
import java.util.Locale

class AndroidTtsBridge(
    private val activity: ComponentActivity,
    private val webView: WebView
) : TextToSpeech.OnInitListener {

    private val appContext: Context = activity.applicationContext
    private var tts: TextToSpeech? = null

    @Volatile
    private var isInitialized: Boolean = false

    @Volatile
    private var isGujaratiReady: Boolean = false

    @Volatile
    private var isShutDown: Boolean = false

    @Volatile
    private var offlineTtsActive: Boolean = false

    @Volatile
    private var pendingOfflineUtteranceId: String? = null

    @Volatile
    private var pendingOfflineText: String? = null

    @Volatile
    private var pendingOfflineRate: Float = 0.96f

    private val humanVoiceManager = GujaratiHumanVoiceManager(
        context = appContext,
        onEvent = { type, utteranceId, source, errorMessage ->
            emitTtsEvent(
                type = type,
                utteranceId = utteranceId,
                source = source,
                errorMessage = errorMessage
            )
        },
        onOfflineFallbackSpeak = { utteranceId, text, speechRate ->
            speakOfflineFallbackInternal(utteranceId, text, speechRate)
        },
        onStopOfflineFallback = {
            stopOfflineTtsOnly()
        }
    )

    init {
        activity.runOnUiThread {
            if (!isShutDown) {
                runCatching {
                    tts = TextToSpeech(appContext, this)
                }.onFailure { err ->
                    Log.w(TAG, "Failed to initialize offline fallback TextToSpeech", err)
                }
            }
        }
    }

    override fun onInit(status: Int) {
        if (isShutDown) return
        val engine = tts ?: return
        if (status != TextToSpeech.SUCCESS) {
            isInitialized = true
            isGujaratiReady = false
            emitTtsEvent("init", "", extraSupported = false)
            return
        }

        val guLocale = Locale.forLanguageTag("gu-IN")
        var selectedVoiceLanguageOk = false

        runCatching {
            val voices = engine.voices.orEmpty()
            val gujaratiVoices = voices.filter { voice ->
                voice.locale != null && voice.locale.language.equals("gu", ignoreCase = true)
            }
            val preferredVoice = gujaratiVoices
                .sortedWith(
                    compareBy<android.speech.tts.Voice>(
                        { it.isNetworkConnectionRequired },
                        { !it.locale.country.equals("IN", ignoreCase = true) },
                        { -it.quality }
                    )
                )
                .firstOrNull()

            if (preferredVoice != null) {
                engine.voice = preferredVoice
                engine.language = preferredVoice.locale
                selectedVoiceLanguageOk = true
            } else {
                val res = engine.setLanguage(guLocale)
                selectedVoiceLanguageOk =
                    res != TextToSpeech.LANG_MISSING_DATA && res != TextToSpeech.LANG_NOT_SUPPORTED
            }
        }.onFailure { err ->
            Log.w(TAG, "Unable to select offline Gujarati fallback voice", err)
        }

        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                offlineTtsActive = true
                emitTtsEvent("start", utteranceId.orEmpty(), source = "offline_fallback")
            }

            override fun onDone(utteranceId: String?) {
                offlineTtsActive = false
                emitTtsEvent("done", utteranceId.orEmpty(), source = "offline_fallback")
            }

            override fun onStop(utteranceId: String?, interrupted: Boolean) {
                offlineTtsActive = false
                emitTtsEvent(
                    "stop",
                    utteranceId.orEmpty(),
                    interrupted = interrupted,
                    source = "offline_fallback"
                )
            }

            @Deprecated("Deprecated in Android API level 21")
            override fun onError(utteranceId: String?) {
                offlineTtsActive = false
                emitTtsEvent("error", utteranceId.orEmpty(), source = "offline_fallback")
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                offlineTtsActive = false
                emitTtsEvent(
                    "error",
                    utteranceId.orEmpty(),
                    errorCode = errorCode,
                    source = "offline_fallback"
                )
            }
        })

        isInitialized = true
        isGujaratiReady = selectedVoiceLanguageOk
        emitTtsEvent("init", "", extraSupported = selectedVoiceLanguageOk)

        val queuedId = pendingOfflineUtteranceId
        val queuedText = pendingOfflineText
        val queuedRate = pendingOfflineRate
        pendingOfflineUtteranceId = null
        pendingOfflineText = null

        if (!queuedId.isNullOrBlank() && !queuedText.isNullOrBlank()) {
            speakOfflineFallbackInternal(queuedId, queuedText, queuedRate)
        }
    }

    @JavascriptInterface
    fun isReady(): Boolean = isInitialized

    @JavascriptInterface
    fun isGujaratiAvailable(): Boolean = true

    @JavascriptInterface
    fun isHumanVoiceSupported(): Boolean = true

    @JavascriptInterface
    fun getVoiceGender(): String = humanVoiceManager.getVoiceGender()

    @JavascriptInterface
    fun setVoiceGender(gender: String) {
        humanVoiceManager.setVoiceGender(gender)
    }

    @JavascriptInterface
    fun speakNaturalChunk(
        utteranceId: String,
        text: String,
        gender: String,
        tone: String,
        speechRate: Float
    ) {
        if (isShutDown) return
        val resolvedGender = gender.ifBlank { humanVoiceManager.getVoiceGender() }
        humanVoiceManager.speak(utteranceId, text, resolvedGender, tone, speechRate)
    }

    @JavascriptInterface
    fun prefetchNaturalChunk(text: String, gender: String, tone: String) {
        if (isShutDown) return
        val resolvedGender = gender.ifBlank { humanVoiceManager.getVoiceGender() }
        humanVoiceManager.prefetch(text, resolvedGender, tone)
    }

    @JavascriptInterface
    fun speakChunk(utteranceId: String, text: String, speechRate: Float) {
        if (isShutDown) return
        humanVoiceManager.speak(
            utteranceId = utteranceId,
            text = text,
            gender = humanVoiceManager.getVoiceGender(),
            tone = "explanation",
            speechRate = speechRate
        )
    }

    @JavascriptInterface
    fun pause() {
        humanVoiceManager.pause()
        if (offlineTtsActive) {
            stopOfflineTtsOnly()
        }
    }

    @JavascriptInterface
    fun resume() {
        humanVoiceManager.resume()
    }

    @JavascriptInterface
    fun stop() {
        humanVoiceManager.stop()
        pendingOfflineUtteranceId = null
        pendingOfflineText = null
        stopOfflineTtsOnly()
    }

    private fun stopOfflineTtsOnly() {
        if (!offlineTtsActive && pendingOfflineUtteranceId == null) return
        offlineTtsActive = false
        pendingOfflineUtteranceId = null
        pendingOfflineText = null
        activity.runOnUiThread {
            runCatching {
                tts?.stop()
            }
        }
    }

    private fun speakOfflineFallbackInternal(
        utteranceId: String,
        text: String,
        speechRate: Float
    ) {
        val cleanText = text.trim()
        val cleanId = utteranceId.trim().ifBlank { "utt_${System.currentTimeMillis()}" }
        if (cleanText.isBlank() || isShutDown) {
            emitTtsEvent("done", cleanId, source = "offline_fallback")
            return
        }

        val clampedRate = speechRate.coerceIn(0.75f, 1.3f)
        if (!isInitialized) {
            pendingOfflineUtteranceId = cleanId
            pendingOfflineText = cleanText
            pendingOfflineRate = clampedRate
            return
        }

        val engine = tts
        if (engine == null || !isGujaratiReady) {
            emitTtsEvent(
                type = "error",
                utteranceId = cleanId,
                source = "offline_fallback",
                errorMessage = "Internet offline and offline Gujarati voice not installed."
            )
            return
        }

        activity.runOnUiThread {
            if (isShutDown) return@runOnUiThread
            runCatching {
                engine.setSpeechRate(clampedRate)
                engine.setPitch(1.02f)
                val params = Bundle().apply {
                    putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, cleanId)
                }
                val rc = engine.speak(cleanText, TextToSpeech.QUEUE_FLUSH, params, cleanId)
                if (rc != TextToSpeech.SUCCESS) {
                    emitTtsEvent(
                        type = "error",
                        utteranceId = cleanId,
                        source = "offline_fallback",
                        errorMessage = "Offline TTS playback failed."
                    )
                }
            }.onFailure { err ->
                emitTtsEvent(
                    type = "error",
                    utteranceId = cleanId,
                    source = "offline_fallback",
                    errorMessage = err.localizedMessage
                )
            }
        }
    }

    fun shutdown() {
        isShutDown = true
        humanVoiceManager.shutdown()
        pendingOfflineUtteranceId = null
        pendingOfflineText = null
        offlineTtsActive = false
        runCatching {
            tts?.stop()
            tts?.shutdown()
        }
        tts = null
    }

    private fun emitTtsEvent(
        type: String,
        utteranceId: String,
        interrupted: Boolean = false,
        errorCode: Int = 0,
        extraSupported: Boolean? = null,
        source: String? = null,
        errorMessage: String? = null
    ) {
        if (isShutDown) return
        val json = JSONObject().apply {
            put("type", type)
            put("utteranceId", utteranceId)
            put("interrupted", interrupted)
            if (errorCode != 0) put("errorCode", errorCode)
            if (extraSupported != null) put("gujaratiSupported", extraSupported)
            if (!source.isNullOrBlank()) put("source", source)
            if (!errorMessage.isNullOrBlank()) put("errorMessage", errorMessage)
            put("humanVoiceSupported", true)
        }.toString()
        val js = "window.__onNativeTtsEvent && window.__onNativeTtsEvent($json);"
        webView.post {
            if (!isShutDown) {
                runCatching {
                    webView.evaluateJavascript(js, null)
                }
            }
        }
    }

    companion object {
        private const val TAG = "AndroidTtsBridge"
    }
}
