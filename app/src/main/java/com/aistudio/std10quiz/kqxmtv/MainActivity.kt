package com.aistudio.std10quiz.kqxmtv

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.KeyEvent
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.RenderProcessGoneDetail
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.pm.PackageInfoCompat
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import com.aistudio.std10quiz.kqxmtv.ui.theme.Std10QuizTheme
import kotlinx.coroutines.delay
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException

private const val APP_HOST = "appassets.androidplatform.net"
private const val START_URL = "https://$APP_HOST/index.html"
private const val WEBVIEW_PREFS_NAME = "quick_quiz_webview_prefs"
private const val KEY_LAST_WEBVIEW_INSTALL_STAMP = "last_loaded_webview_install_stamp"

class MainActivity : ComponentActivity() {
    private var activeBridgeRef: NativeFirebaseBridge? = null
    private var activeWebViewRef: WebView? = null
    private var latestLayoutInfoRef: WindowLayoutInfo? = null

    private var wasImeVisible: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureAppCheck(this, intent)
        enableEdgeToEdge()
        val initialSettings = AdaptiveDisplayManager.loadSettings(this)
        val initialTelemetry = AdaptiveDisplayManager.collectTelemetry(this, null, initialSettings)
        AdaptiveDisplayManager.applyActivityDisplaySettings(this, initialSettings, initialTelemetry)

        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
            val imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
            val settings = AdaptiveDisplayManager.loadSettings(this)
            if (settings.isFullScreen && !imeVisible && wasImeVisible) {
                view.post {
                    if (AdaptiveDisplayManager.loadSettings(this).isFullScreen) {
                        WindowCompat.getInsetsController(window, window.decorView)
                            .hide(WindowInsetsCompat.Type.systemBars())
                    }
                }
            }
            wasImeVisible = imeVisible
            ViewCompat.onApplyWindowInsets(view, insets)
        }

        AdminNotificationHelper.clearStaleFcmTopicQueue(this)
        AdminNotificationHelper.ensureChannels(this)
        AdminBackgroundNotificationWorker.initializeWatermarksIfNeeded(this)
        AdminBackgroundNotificationWorker.ensurePeriodicScheduled(this)
        AdminNotificationHelper.extractDeepLinkFromIntent(intent)?.let { deepLink ->
            AdminNotificationHelper.savePendingDeepLink(this, deepLink)
        }
        setContent {
            Std10QuizTheme {
                PortalWebContainer(
                    onBridgeChanged = { bridge ->
                        activeBridgeRef = bridge
                    },
                    onWebViewChanged = { wv ->
                        activeWebViewRef = wv
                    },
                    onLayoutInfoChanged = { info ->
                        latestLayoutInfoRef = info
                    }
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        activeWebViewRef?.onResume()
        activeWebViewRef?.resumeTimers()
        activeBridgeRef?.onHostActivityResumed()
        val settings = AdaptiveDisplayManager.loadSettings(this)
        val telemetry = AdaptiveDisplayManager.collectTelemetry(this, latestLayoutInfoRef, settings)
        AdaptiveDisplayManager.applyActivityDisplaySettings(this, settings, telemetry)
    }

    override fun onPause() {
        activeWebViewRef?.onPause()
        super.onPause()
    }

    override fun onStop() {
        super.onStop()
        AdminBackgroundNotificationWorker.scheduleQuickBackgroundCheck(this)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val settings = AdaptiveDisplayManager.loadSettings(this)
        val telemetry = AdaptiveDisplayManager.collectTelemetry(this, latestLayoutInfoRef, settings)
        AdaptiveDisplayManager.applyActivityDisplaySettings(this, settings, telemetry)
        AdaptiveDisplayManager.pushTelemetryToWebView(activeWebViewRef, telemetry)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            val settings = AdaptiveDisplayManager.loadSettings(this)
            if (settings.isFullScreen) {
                val telemetry = AdaptiveDisplayManager.collectTelemetry(this, latestLayoutInfoRef, settings)
                AdaptiveDisplayManager.applyActivityDisplaySettings(this, settings, telemetry)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        AdminNotificationHelper.extractDeepLinkFromIntent(intent)?.let { deepLink ->
            AdminNotificationHelper.savePendingDeepLink(this, deepLink)
            activeBridgeRef?.emitPendingDeepLink()
        }
    }
}

private class AndroidExportBridge(
    private val activity: ComponentActivity,
    private val onAppMounted: () -> Unit = {}
) {
    @JavascriptInterface
    fun notifyAppMounted() {
        activity.runOnUiThread {
            onAppMounted()
        }
    }

    @JavascriptInterface
    fun saveExportedFile(suggestedName: String, dataUrl: String) {
        activity.runOnUiThread {
            try {
                val commaIdx = dataUrl.indexOf(',')
                if (commaIdx <= 0) return@runOnUiThread
                val header = dataUrl.substring(0, commaIdx)
                val base64Part = dataUrl.substring(commaIdx + 1)
                val bytes = Base64.decode(base64Part, Base64.DEFAULT)

                val mimeType = header
                    .removePrefix("data:")
                    .substringBefore(';')
                    .ifBlank { "application/octet-stream" }

                val safeName = suggestedName
                    .replace(Regex("[^A-Za-z0-9._-]"), "_")
                    .ifBlank {
                        if (mimeType.contains("pdf")) "access_codes.pdf" else "access_codes.csv"
                    }

                val exportDir = File(activity.cacheDir, "exports").apply { mkdirs() }
                val outFile = File(exportDir, safeName)
                outFile.writeBytes(bytes)

                val uri = FileProvider.getUriForFile(
                    activity,
                    "${activity.packageName}.fileprovider",
                    outFile
                )
                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                    type = mimeType
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                activity.startActivity(
                    Intent.createChooser(
                        shareIntent,
                        activity.getString(R.string.share_export_title)
                    )
                )
            } catch (e: Exception) {
                Toast.makeText(
                    activity,
                    e.localizedMessage ?: activity.getString(R.string.error_no_app),
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    @JavascriptInterface
    fun downloadQrToGallery(suggestedName: String, dataUrl: String) {
        val commaIdx = dataUrl.indexOf(',')
        if (commaIdx <= 0) return
        val base64Part = dataUrl.substring(commaIdx + 1)
        val bytes = try {
            Base64.decode(base64Part, Base64.DEFAULT)
        } catch (_: Exception) {
            return
        }
        val baseName = suggestedName
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
            .removeSuffix(".png")
            .ifBlank { "Std10Quiz_UPI_QR" }
        val uniqueName = "${baseName}_${System.currentTimeMillis() % 100000}.png"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            Thread {
                val resolver = activity.contentResolver
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, uniqueName)
                    put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                    put(
                        MediaStore.Images.Media.RELATIVE_PATH,
                        "${Environment.DIRECTORY_PICTURES}/Std10Quiz"
                    )
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
                var savedOk = false
                var insertedUri: Uri? = null
                try {
                    insertedUri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                    if (insertedUri != null) {
                        resolver.openOutputStream(insertedUri)?.use { out ->
                            out.write(bytes)
                            out.flush()
                        }
                        values.clear()
                        values.put(MediaStore.Images.Media.IS_PENDING, 0)
                        resolver.update(insertedUri, values, null, null)
                        savedOk = true
                    }
                } catch (_: Exception) {
                    insertedUri?.let { runCatching { resolver.delete(it, null, null) } }
                }
                activity.runOnUiThread {
                    if (savedOk) {
                        Toast.makeText(
                            activity,
                            activity.getString(R.string.qr_downloaded_gallery),
                            Toast.LENGTH_LONG
                        ).show()
                    } else {
                        saveExportedFile("$baseName.png", dataUrl)
                    }
                }
            }.start()
        } else {
            saveExportedFile("$baseName.png", dataUrl)
        }
    }

    @JavascriptInterface
    fun openUpiPayment(upiUrl: String, fallbackUpiUrl: String) {
        activity.runOnUiThread {
            launchUpiUriWithFallback(activity, upiUrl, fallbackUpiUrl)
        }
    }

    @JavascriptInterface
    fun openExternalUrl(url: String) {
        activity.runOnUiThread {
            try {
                val parsed = Uri.parse(url)
                val scheme = parsed.scheme.orEmpty().lowercase()
                if (scheme !in setOf("https", "http", "whatsapp")) {
                    return@runOnUiThread
                }
                val intent = Intent(Intent.ACTION_VIEW, parsed).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                }
                activity.startActivity(intent)
            } catch (_: Exception) {
                Toast.makeText(
                    activity,
                    activity.getString(R.string.error_no_app),
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    @JavascriptInterface
    fun shareScreenshotOnWhatsApp(phoneDigits: String, message: String, dataUrl: String) {
        activity.runOnUiThread {
            val cleanPhone = phoneDigits.replace(Regex("[^0-9]"), "")
            val hasDataImage = dataUrl.startsWith("data:image/") && dataUrl.contains(',')
            if (!hasDataImage) {
                val waUrl = if (cleanPhone.isNotEmpty()) {
                    "https://wa.me/$cleanPhone?text=${Uri.encode(message)}"
                } else {
                    "https://wa.me/?text=${Uri.encode(message)}"
                }
                openExternalUrl(waUrl)
                return@runOnUiThread
            }

            try {
                val commaIdx = dataUrl.indexOf(',')
                val header = dataUrl.substring(0, commaIdx)
                val base64Part = dataUrl.substring(commaIdx + 1)
                val bytes = Base64.decode(base64Part, Base64.DEFAULT)
                val mimeType = header
                    .removePrefix("data:")
                    .substringBefore(';')
                    .ifBlank { "image/jpeg" }
                val ext = if (mimeType.contains("png")) "png" else "jpg"

                val exportDir = File(activity.cacheDir, "exports").apply { mkdirs() }
                val outFile = File(exportDir, "payment_screenshot.$ext")
                outFile.writeBytes(bytes)

                val uri = FileProvider.getUriForFile(
                    activity,
                    "${activity.packageName}.fileprovider",
                    outFile
                )

                val packages = listOf("com.whatsapp", "com.whatsapp.w4b")
                for (pkg in packages) {
                    val waIntent = Intent(Intent.ACTION_SEND).apply {
                        type = mimeType
                        setPackage(pkg)
                        putExtra(Intent.EXTRA_STREAM, uri)
                        if (message.isNotBlank()) {
                            putExtra(Intent.EXTRA_TEXT, message)
                        }
                        if (cleanPhone.isNotEmpty()) {
                            putExtra("jid", "$cleanPhone@s.whatsapp.net")
                        }
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    try {
                        activity.startActivity(waIntent)
                        return@runOnUiThread
                    } catch (_: ActivityNotFoundException) {
                        // Try next WhatsApp package
                    }
                }

                val fallbackIntent = Intent(Intent.ACTION_SEND).apply {
                    type = mimeType
                    putExtra(Intent.EXTRA_STREAM, uri)
                    if (message.isNotBlank()) {
                        putExtra(Intent.EXTRA_TEXT, message)
                    }
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                activity.startActivity(
                    Intent.createChooser(
                        fallbackIntent,
                        activity.getString(R.string.share_export_title)
                    )
                )
            } catch (_: Exception) {
                val waUrl = if (cleanPhone.isNotEmpty()) {
                    "https://wa.me/$cleanPhone?text=${Uri.encode(message)}"
                } else {
                    "https://wa.me/?text=${Uri.encode(message)}"
                }
                openExternalUrl(waUrl)
            }
        }
    }
}

private fun launchUpiUriWithFallback(
    context: android.content.Context,
    primaryUrl: String,
    fallbackUrl: String
) {
    val primaryUri = Uri.parse(primaryUrl)
    val scheme = primaryUri.scheme.orEmpty().lowercase()
    val allowedSchemes = setOf("upi", "tez", "phonepe", "paytmmp")
    if (scheme !in allowedSchemes) {
        Toast.makeText(context, context.getString(R.string.error_no_upi_app), Toast.LENGTH_SHORT).show()
        return
    }

    val primaryIntent = Intent(Intent.ACTION_VIEW, primaryUri).apply {
        addCategory(Intent.CATEGORY_BROWSABLE)
    }

    try {
        if (scheme == "upi") {
            context.startActivity(
                Intent.createChooser(primaryIntent, context.getString(R.string.upi_chooser_title))
            )
        } else {
            context.startActivity(primaryIntent)
        }
        return
    } catch (_: ActivityNotFoundException) {
        // Fall through to generic upi:// chooser if the specific app isn't installed
    } catch (_: Exception) {
        // Fall through to generic upi:// chooser
    }

    if (fallbackUrl.isNotBlank() && fallbackUrl != primaryUrl) {
        val fallbackUri = Uri.parse(fallbackUrl)
        if (fallbackUri.scheme.orEmpty().lowercase() == "upi") {
            try {
                val fallbackIntent = Intent(Intent.ACTION_VIEW, fallbackUri).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                }
                context.startActivity(
                    Intent.createChooser(fallbackIntent, context.getString(R.string.upi_chooser_title))
                )
                return
            } catch (_: Exception) {
                // Handled below
            }
        }
    }

    Toast.makeText(context, context.getString(R.string.error_no_upi_app), Toast.LENGTH_LONG).show()
}

private tailrec fun Context.findComponentActivity(): ComponentActivity? = when (this) {
    is ComponentActivity -> this
    is ContextWrapper -> baseContext.findComponentActivity()
    else -> null
}

@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun PortalWebContainer(
    onBridgeChanged: (NativeFirebaseBridge?) -> Unit = {},
    onWebViewChanged: (WebView?) -> Unit = {},
    onLayoutInfoChanged: (WindowLayoutInfo?) -> Unit = {}
) {
    val context = LocalContext.current
    val activity = remember(context) { context.findComponentActivity() }
    if (activity == null) return

    val configuration = LocalConfiguration.current
    val windowSizeClass = calculateWindowSizeClass(activity)
    val layoutInfoFlow = remember(activity) {
        WindowInfoTracker.getOrCreate(activity).windowLayoutInfo(activity)
    }
    val layoutInfo by layoutInfoFlow.collectAsState(initial = null)

    var displaySettings by remember {
        mutableStateOf(AdaptiveDisplayManager.loadSettings(activity))
    }
    var loadProgress by remember { mutableIntStateOf(0) }
    var isWebAppMounted by remember { mutableStateOf(false) }
    var startupLoadError by remember { mutableStateOf<String?>(null) }
    var autoRecoveryAttempted by remember { mutableStateOf(false) }
    var reloadTrigger by remember { mutableIntStateOf(0) }
    var canGoBack by remember { mutableStateOf(false) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var firebaseBridgeRef by remember { mutableStateOf<NativeFirebaseBridge?>(null) }
    var pendingFileCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    val surfaceBgColor = MaterialTheme.colorScheme.background
    val surfaceBgArgb = surfaceBgColor.toArgb()

    // Two-stage startup watchdog: prevents ever showing a blank white/cream screen if WebView stalls
    LaunchedEffect(isWebAppMounted, reloadTrigger) {
        if (isWebAppMounted) return@LaunchedEffect
        delay(4500)
        if (!isWebAppMounted && !autoRecoveryAttempted) {
            val wv = webViewRef
            if (wv != null) {
                wv.evaluateJavascript("(function(){return Boolean(window.__QQ_APP_MOUNTED__);})()") { res ->
                    if (res?.trim() == "true") {
                        isWebAppMounted = true
                        startupLoadError = null
                    } else if (!autoRecoveryAttempted) {
                        autoRecoveryAttempted = true
                        Log.w("MainActivity", "Web UI not mounted after 4.5s; clearing cache and retrying once.")
                        runCatching { wv.clearCache(true) }
                        wv.loadUrl("$START_URL?recover=${System.currentTimeMillis()}")
                    }
                }
            }
        }
        delay(5500)
        if (!isWebAppMounted) {
            val wv = webViewRef
            if (wv != null) {
                wv.evaluateJavascript("(function(){return Boolean(window.__QQ_APP_MOUNTED__);})()") { res ->
                    if (res?.trim() == "true") {
                        isWebAppMounted = true
                        startupLoadError = null
                    } else if (startupLoadError == null) {
                        startupLoadError = "WebView startup timeout"
                    }
                }
            } else if (startupLoadError == null) {
                startupLoadError = "WebView unavailable"
            }
        }
    }

    LaunchedEffect(layoutInfo) {
        onLayoutInfoChanged(layoutInfo)
    }

    LaunchedEffect(configuration, layoutInfo, windowSizeClass, displaySettings, webViewRef) {
        val telemetry = AdaptiveDisplayManager.collectTelemetry(activity, layoutInfo, displaySettings)
        AdaptiveDisplayManager.applyActivityDisplaySettings(activity, displaySettings, telemetry)
        AdaptiveDisplayManager.pushTelemetryToWebView(webViewRef, telemetry)
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        firebaseBridgeRef?.onNotificationPermissionResult(granted)
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        pendingFileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        pendingFileCallback = null
    }

    val webDocumentPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        pendingFileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        pendingFileCallback = null
    }

    val adminApkPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        firebaseBridgeRef?.onApkFilePickedResult(uri)
    }

    BackHandler(enabled = canGoBack) {
        webViewRef?.goBack()
    }

    DisposableEffect(Unit) {
        onDispose {
            pendingFileCallback?.onReceiveValue(null)
            pendingFileCallback = null
            firebaseBridgeRef?.detach()
            firebaseBridgeRef = null
            onBridgeChanged(null)
            onWebViewChanged(null)
            webViewRef?.destroy()
            webViewRef = null
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            containerColor = if (isWebAppMounted) surfaceBgColor else Color.Black,
            contentWindowInsets = WindowInsets.safeDrawing
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = {
                        WebView(activity).apply {
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            )
                            webViewRef = this
                            onWebViewChanged(this)
                            isFocusable = true
                            isFocusableInTouchMode = true
                            setBackgroundColor(android.graphics.Color.BLACK)
                            // Clear stale HTTP cache automatically whenever ANY APK update/reinstall happens
                            runCatching {
                                val pkgInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                    activity.packageManager.getPackageInfo(
                                        activity.packageName,
                                        android.content.pm.PackageManager.PackageInfoFlags.of(0)
                                    )
                                } else {
                                    @Suppress("DEPRECATION")
                                    activity.packageManager.getPackageInfo(activity.packageName, 0)
                                }
                                val currentVerCode = PackageInfoCompat.getLongVersionCode(pkgInfo)
                                val installStamp = "${currentVerCode}_${pkgInfo.lastUpdateTime}_${BuildConfig.VERSION_NAME}"
                                val prefs = activity.getSharedPreferences(WEBVIEW_PREFS_NAME, Context.MODE_PRIVATE)
                                val lastStamp = prefs.getString(KEY_LAST_WEBVIEW_INSTALL_STAMP, null)
                                if (lastStamp != installStamp) {
                                    clearCache(true)
                                    clearFormData()
                                    prefs.edit().putString(KEY_LAST_WEBVIEW_INSTALL_STAMP, installStamp).apply()
                                }
                            }.onFailure { err ->
                                Log.w("MainActivity", "WebView install cache check skipped", err)
                            }
                            settings.apply {
                                javaScriptEnabled = true
                                domStorageEnabled = true
                                allowContentAccess = false
                                allowFileAccess = false
                                cacheMode = WebSettings.LOAD_NO_CACHE
                                mediaPlaybackRequiresUserGesture = false
                                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                useWideViewPort = true
                                loadWithOverviewMode = true
                                textZoom = 100
                            }

                            addJavascriptInterface(
                                AndroidExportBridge(
                                    activity = activity,
                                    onAppMounted = {
                                        isWebAppMounted = true
                                        startupLoadError = null
                                    }
                                ),
                                "AndroidBridge"
                            )
                            addJavascriptInterface(
                                AndroidDisplayBridge(
                                    activity = activity,
                                    getLayoutInfo = { layoutInfo },
                                    onSettingsApplied = { nextSettings, telemetry ->
                                        displaySettings = nextSettings
                                        AdaptiveDisplayManager.pushTelemetryToWebView(this, telemetry)
                                    }
                                ),
                                "AndroidDisplayBridge"
                            )

                        runCatching {
                            val firebaseBridge = NativeFirebaseBridge(
                                activity = activity,
                                webView = this,
                                onRequestPostNotificationsPermission = {
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                        notificationPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                                    } else {
                                        firebaseBridgeRef?.onNotificationPermissionResult(true)
                                    }
                                },
                                onLaunchApkPicker = {
                                    adminApkPickerLauncher.launch(
                                        arrayOf(
                                            "application/octet-stream",
                                            "*/*"
                                        )
                                    )
                                }
                            )
                            firebaseBridgeRef = firebaseBridge
                            onBridgeChanged(firebaseBridge)
                            addJavascriptInterface(firebaseBridge, "AndroidFirebaseBridge")
                            firebaseBridge.attach()
                        }.onFailure { err ->
                            Log.e("MainActivity", "NativeFirebaseBridge init failed", err)
                        }

                        setOnKeyListener { v, keyCode, event ->
                            if (event.action == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_BACK) {
                                if (canGoBack) {
                                    goBack()
                                    return@setOnKeyListener true
                                }
                            }
                            if (event.action == KeyEvent.ACTION_DOWN &&
                                keyCode in setOf(
                                    KeyEvent.KEYCODE_DPAD_UP,
                                    KeyEvent.KEYCODE_DPAD_DOWN,
                                    KeyEvent.KEYCODE_DPAD_LEFT,
                                    KeyEvent.KEYCODE_DPAD_RIGHT,
                                    KeyEvent.KEYCODE_DPAD_CENTER
                                )
                            ) {
                                if (!v.hasFocus()) {
                                    v.requestFocus()
                                }
                            }
                            false
                        }

                        webViewClient = object : WebViewClient() {
                            override fun shouldInterceptRequest(
                                view: WebView?,
                                request: WebResourceRequest?
                            ): WebResourceResponse? {
                                val url = request?.url ?: return null
                                if (url.host != APP_HOST) return null

                                val relPath = url.path.orEmpty().trimStart('/')
                                if (relPath.contains("..")) {
                                    return notFoundAssetResponse()
                                }
                                val targetPath = if (relPath.isEmpty()) "www/index.html" else "www/$relPath"
                                return openAssetResponse(activity, targetPath)
                                    ?: if (!relPath.contains('.')) {
                                        openAssetResponse(activity, "www/index.html")
                                    } else {
                                        Log.w("MainActivity", "Missing bundled asset: $targetPath")
                                        notFoundAssetResponse()
                                    }
                            }

                            override fun shouldOverrideUrlLoading(
                                view: WebView?,
                                request: WebResourceRequest?
                            ): Boolean {
                                val uri = request?.url ?: return false
                                val host = uri.host.orEmpty()
                                val scheme = uri.scheme.orEmpty().lowercase()

                                if (host == APP_HOST || scheme == "about") {
                                    return false
                                }
                                if (host.endsWith("google.com") ||
                                    host.endsWith("gstatic.com") ||
                                    host.endsWith("firebaseapp.com")
                                ) {
                                    return false
                                }

                                if (scheme in setOf("upi", "tez", "phonepe", "paytmmp")) {
                                    launchUpiUriWithFallback(activity, uri.toString(), "")
                                    return true
                                }

                                if (scheme == "intent") {
                                    return try {
                                        val parsedIntent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                                            addCategory(Intent.CATEGORY_BROWSABLE)
                                            component = null
                                            selector = null
                                            removeFlags(
                                                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                                                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                                                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                                                    Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
                                            )
                                        }
                                        val innerScheme = parsedIntent.data?.scheme.orEmpty().lowercase()
                                        val allowedIntentSchemes = setOf("upi", "tez", "phonepe", "paytmmp", "https", "whatsapp")
                                        if (innerScheme !in allowedIntentSchemes) {
                                            return true
                                        }
                                        try {
                                            activity.startActivity(parsedIntent)
                                        } catch (_: ActivityNotFoundException) {
                                            val fallbackUrl = parsedIntent.getStringExtra("browser_fallback_url")
                                            if (!fallbackUrl.isNullOrBlank() &&
                                                fallbackUrl.startsWith("https://", ignoreCase = true)
                                            ) {
                                                view?.loadUrl(fallbackUrl)
                                            } else {
                                                Toast.makeText(
                                                    activity,
                                                    activity.getString(R.string.error_no_upi_app),
                                                    Toast.LENGTH_SHORT
                                                ).show()
                                            }
                                        }
                                        true
                                    } catch (_: Exception) {
                                        true
                                    }
                                }

                                if (scheme !in setOf("https", "whatsapp")) {
                                    return true
                                }

                                return try {
                                    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                                        addCategory(Intent.CATEGORY_BROWSABLE)
                                    }
                                    activity.startActivity(intent)
                                    true
                                } catch (_: Exception) {
                                    Toast.makeText(
                                        activity,
                                        activity.getString(R.string.error_no_app),
                                        Toast.LENGTH_SHORT
                                    ).show()
                                    true
                                }
                            }

                            override fun onReceivedError(
                                view: WebView?,
                                request: WebResourceRequest?,
                                error: WebResourceError?
                            ) {
                                super.onReceivedError(view, request, error)
                                if (request?.isForMainFrame == true) {
                                    val detail = "Error ${error?.errorCode ?: -1}: ${error?.description ?: "Load failed"}"
                                    Log.e("MainActivity", "Main frame load error: $detail")
                                    startupLoadError = detail
                                }
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                super.onPageFinished(view, url)
                                canGoBack = view?.canGoBack() == true
                                val telemetry = AdaptiveDisplayManager.collectTelemetry(
                                    activity,
                                    layoutInfo,
                                    displaySettings
                                )
                                AdaptiveDisplayManager.pushTelemetryToWebView(view, telemetry)
                                view?.evaluateJavascript("(function(){return Boolean(window.__QQ_APP_MOUNTED__);})()") { result ->
                                    if (result?.trim() == "true") {
                                        isWebAppMounted = true
                                        startupLoadError = null
                                    }
                                }
                            }

                            override fun onRenderProcessGone(
                                view: WebView?,
                                detail: RenderProcessGoneDetail?
                            ): Boolean {
                                Log.e(
                                    "MainActivity",
                                    "WebView render process gone (didCrash=${detail?.didCrash()}); reloading activity."
                                )
                                activity.runOnUiThread {
                                    if (!activity.isFinishing && !activity.isDestroyed) {
                                        activity.recreate()
                                    }
                                }
                                return true
                            }
                        }

                        webChromeClient = object : WebChromeClient() {
                            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                                if (consoleMessage != null && consoleMessage.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                                    Log.e(
                                        "QuickQuizWeb",
                                        "${consoleMessage.message()} (${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})"
                                    )
                                }
                                return super.onConsoleMessage(consoleMessage)
                            }

                            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                                loadProgress = newProgress
                                canGoBack = view?.canGoBack() == true
                            }

                            override fun onShowFileChooser(
                                webView: WebView?,
                                filePathCallback: ValueCallback<Array<Uri>>?,
                                fileChooserParams: FileChooserParams?
                            ): Boolean {
                                pendingFileCallback?.onReceiveValue(null)
                                pendingFileCallback = filePathCallback
                                val acceptTypes = fileChooserParams?.acceptTypes
                                    ?.joinToString(",")
                                    ?.lowercase()
                                    .orEmpty()
                                val wantsNonImage = acceptTypes.contains("apk") ||
                                    acceptTypes.contains("application/") ||
                                    acceptTypes.contains("*/*")
                                return try {
                                    if (wantsNonImage) {
                                        webDocumentPickerLauncher.launch(
                                            arrayOf(
                                                "application/octet-stream",
                                                "*/*"
                                            )
                                        )
                                    } else {
                                        photoPickerLauncher.launch(
                                            PickVisualMediaRequest(
                                                ActivityResultContracts.PickVisualMedia.ImageOnly
                                            )
                                        )
                                    }
                                    true
                                } catch (_: Exception) {
                                    pendingFileCallback?.onReceiveValue(null)
                                    pendingFileCallback = null
                                    false
                                }
                            }
                        }

                        setDownloadListener { url, _, contentDisposition, mimetype, _ ->
                            val guessedName = URLUtil.guessFileName(url, contentDisposition, mimetype)
                                .replace("'", "")
                            if (url.startsWith("data:")) {
                                AndroidExportBridge(activity).saveExportedFile(guessedName, url)
                            } else if (url.startsWith("blob:")) {
                                val escapedUrl = url.replace("\\", "\\\\").replace("'", "\\'")
                                val js = """
                                    (function() {
                                      fetch('$escapedUrl')
                                        .then(function(r) { return r.blob(); })
                                        .then(function(b) {
                                          var fr = new FileReader();
                                          fr.onloadend = function() {
                                            if (window.AndroidBridge && fr.result) {
                                              window.AndroidBridge.saveExportedFile('$guessedName', fr.result);
                                            }
                                          };
                                          fr.readAsDataURL(b);
                                        });
                                    })();
                                """.trimIndent()
                                evaluateJavascript(js, null)
                            } else if (url.startsWith("https://", ignoreCase = true)) {
                                try {
                                    val dlIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                                        addCategory(Intent.CATEGORY_BROWSABLE)
                                    }
                                    activity.startActivity(dlIntent)
                                } catch (_: Exception) {
                                    Toast.makeText(
                                        activity,
                                        activity.getString(R.string.error_no_app),
                                        Toast.LENGTH_SHORT
                                    ).show()
                                }
                            }
                        }

                        loadUrl(START_URL)
                    }
                },
                update = { wv ->
                    val lp = wv.layoutParams
                    if (lp == null ||
                        lp.width != ViewGroup.LayoutParams.MATCH_PARENT ||
                        lp.height != ViewGroup.LayoutParams.MATCH_PARENT
                    ) {
                        wv.layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                        wv.requestLayout()
                    }
                    val desiredBg = if (isWebAppMounted) surfaceBgArgb else android.graphics.Color.BLACK
                    if (wv.tag != desiredBg) {
                        wv.tag = desiredBg
                        wv.setBackgroundColor(desiredBg)
                    }
                }
            )

            if (loadProgress in 1..99 && isWebAppMounted) {
                LinearProgressIndicator(
                    progress = { loadProgress / 100f },
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopCenter),
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }

        AnimatedVisibility(
            visible = !isWebAppMounted && startupLoadError == null,
            exit = fadeOut()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(24.dp)
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.ic_app_logo),
                        contentDescription = stringResource(id = R.string.app_name),
                        modifier = Modifier.size(180.dp),
                        contentScale = ContentScale.Fit
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = stringResource(id = R.string.app_name),
                        color = Color(0xFFFACC15),
                        fontSize = 26.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Spacer(modifier = Modifier.height(18.dp))
                    CircularProgressIndicator(
                        color = Color(0xFFFACC15),
                        strokeWidth = 3.dp,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }
        }

        if (!isWebAppMounted && startupLoadError != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier
                        .widthIn(max = 420.dp)
                        .padding(24.dp)
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.ic_app_logo),
                        contentDescription = stringResource(id = R.string.app_name),
                        modifier = Modifier.size(120.dp),
                        contentScale = ContentScale.Fit
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = stringResource(id = R.string.startup_load_error_title),
                        color = Color(0xFFFACC15),
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(id = R.string.startup_load_error_desc),
                        color = Color(0xFFCBD5E1),
                        fontSize = 14.sp,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(20.dp))
                    Button(
                        onClick = {
                            startupLoadError = null
                            autoRecoveryAttempted = false
                            reloadTrigger += 1
                            webViewRef?.let { wv ->
                                runCatching { wv.clearCache(true) }
                                wv.loadUrl("$START_URL?reload=${System.currentTimeMillis()}")
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFFACC15),
                            contentColor = Color(0xFF0F172A)
                        ),
                        modifier = Modifier
                            .testTag("startup_reload_button")
                            .fillMaxWidth()
                            .heightIn(min = 52.dp)
                    ) {
                        Text(
                            text = stringResource(id = R.string.startup_reload_button),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                }
            }
        }
    }
}

private fun openAssetResponse(
    context: android.content.Context,
    assetPath: String
): WebResourceResponse? {
    return try {
        val stream = context.assets.open(assetPath)
        val mime = guessMimeType(assetPath)
        val headers = mapOf(
            "Access-Control-Allow-Origin" to "https://$APP_HOST",
            "Cache-Control" to "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma" to "no-cache",
            "Expires" to "0"
        )
        WebResourceResponse(mime, "UTF-8", 200, "OK", headers, stream)
    } catch (_: IOException) {
        null
    }
}

private fun notFoundAssetResponse(): WebResourceResponse {
    return WebResourceResponse(
        "text/plain",
        "UTF-8",
        404,
        "Not Found",
        mapOf("Cache-Control" to "no-store, no-cache, must-revalidate, max-age=0"),
        ByteArrayInputStream(ByteArray(0))
    )
}

private fun guessMimeType(path: String): String {
    val ext = path.substringAfterLast('.', "").lowercase()
    return when (ext) {
        "html", "htm" -> "text/html"
        "js", "mjs" -> "application/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "svg" -> "image/svg+xml"
        "jpg", "jpeg" -> "image/jpeg"
        "png" -> "image/png"
        "webp" -> "image/webp"
        "ttf" -> "font/ttf"
        "woff2" -> "font/woff2"
        else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
    }
}
