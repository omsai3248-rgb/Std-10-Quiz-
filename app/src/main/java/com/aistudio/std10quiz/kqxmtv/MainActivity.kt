package com.aistudio.std10quiz.kqxmtv

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import com.aistudio.std10quiz.kqxmtv.ui.theme.Std10QuizTheme
import java.io.File
import java.io.IOException

private const val APP_HOST = "appassets.androidplatform.net"
private const val START_URL = "https://$APP_HOST/index.html"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Std10QuizTheme {
                PortalWebContainer()
            }
        }
    }
}

private class AndroidExportBridge(
    private val activity: ComponentActivity
) {
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

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun PortalWebContainer() {
    val context = LocalContext.current
    val activity = context as ComponentActivity

    var loadProgress by remember { mutableIntStateOf(0) }
    var canGoBack by remember { mutableStateOf(false) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var pendingFileCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        pendingFileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        pendingFileCallback = null
    }

    BackHandler(enabled = canGoBack) {
        webViewRef?.goBack()
    }

    DisposableEffect(Unit) {
        onDispose {
            pendingFileCallback?.onReceiveValue(null)
            pendingFileCallback = null
            webViewRef?.destroy()
            webViewRef = null
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        contentWindowInsets = WindowInsets.safeDrawing
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    WebView(ctx).apply {
                        webViewRef = this
                        setBackgroundColor(android.graphics.Color.TRANSPARENT)
                        settings.apply {
                            javaScriptEnabled = true
                            domStorageEnabled = true
                            databaseEnabled = true
                            allowContentAccess = true
                            allowFileAccess = false
                            mediaPlaybackRequiresUserGesture = false
                            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                            useWideViewPort = true
                            loadWithOverviewMode = true
                        }

                        addJavascriptInterface(AndroidExportBridge(activity), "AndroidBridge")

                        webViewClient = object : WebViewClient() {
                            override fun shouldInterceptRequest(
                                view: WebView?,
                                request: WebResourceRequest?
                            ): WebResourceResponse? {
                                val url = request?.url ?: return null
                                if (url.host != APP_HOST) return null

                                val relPath = url.path.orEmpty().trimStart('/')
                                val targetPath = if (relPath.isEmpty()) "www/index.html" else "www/$relPath"
                                return openAssetResponse(ctx, targetPath)
                                    ?: if (!relPath.contains('.')) {
                                        openAssetResponse(ctx, "www/index.html")
                                    } else {
                                        null
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
                                    launchUpiUriWithFallback(ctx, uri.toString(), "")
                                    return true
                                }

                                if (scheme == "intent") {
                                    return try {
                                        val parsedIntent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
                                        try {
                                            ctx.startActivity(parsedIntent)
                                        } catch (_: ActivityNotFoundException) {
                                            val fallbackUrl = parsedIntent.getStringExtra("browser_fallback_url")
                                            if (!fallbackUrl.isNullOrBlank()) {
                                                view?.loadUrl(fallbackUrl)
                                            } else {
                                                Toast.makeText(
                                                    ctx,
                                                    ctx.getString(R.string.error_no_upi_app),
                                                    Toast.LENGTH_SHORT
                                                ).show()
                                            }
                                        }
                                        true
                                    } catch (_: Exception) {
                                        true
                                    }
                                }

                                return try {
                                    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                                        addCategory(Intent.CATEGORY_BROWSABLE)
                                    }
                                    ctx.startActivity(intent)
                                    true
                                } catch (_: Exception) {
                                    Toast.makeText(
                                        ctx,
                                        ctx.getString(R.string.error_no_app),
                                        Toast.LENGTH_SHORT
                                    ).show()
                                    true
                                }
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                super.onPageFinished(view, url)
                                canGoBack = view?.canGoBack() == true
                            }
                        }

                        webChromeClient = object : WebChromeClient() {
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
                                return try {
                                    photoPickerLauncher.launch(
                                        PickVisualMediaRequest(
                                            ActivityResultContracts.PickVisualMedia.ImageOnly
                                        )
                                    )
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
                            } else {
                                try {
                                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                } catch (_: Exception) {
                                    Toast.makeText(
                                        ctx,
                                        ctx.getString(R.string.error_no_app),
                                        Toast.LENGTH_SHORT
                                    ).show()
                                }
                            }
                        }

                        loadUrl(START_URL)
                    }
                }
            )

            if (loadProgress in 1..99) {
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
}

private fun openAssetResponse(
    context: android.content.Context,
    assetPath: String
): WebResourceResponse? {
    return try {
        val stream = context.assets.open(assetPath)
        val mime = guessMimeType(assetPath)
        val headers = mapOf("Access-Control-Allow-Origin" to "*")
        WebResourceResponse(mime, "UTF-8", 200, "OK", headers, stream)
    } catch (_: IOException) {
        null
    }
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
