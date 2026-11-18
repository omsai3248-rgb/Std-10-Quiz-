package com.aistudio.std10quiz.kqxmtv

import android.app.UiModeManager
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.util.DisplayMetrics
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowLayoutInfo
import androidx.window.layout.WindowMetricsCalculator
import org.json.JSONObject
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class DisplaySettings(
    val displayMode: String = MODE_AUTO_ADAPTIVE,
    val isFullScreen: Boolean = true
) {
    companion object {
        const val MODE_AUTO_ADAPTIVE = "auto_adaptive"
        const val MODE_PORTRAIT = "portrait"
        const val MODE_LANDSCAPE = "landscape"

        fun normalizeMode(raw: String?): String = when (raw?.trim()?.lowercase()) {
            MODE_PORTRAIT -> MODE_PORTRAIT
            MODE_LANDSCAPE -> MODE_LANDSCAPE
            else -> MODE_AUTO_ADAPTIVE
        }
    }
}

data class NativeDisplayTelemetry(
    val deviceType: String,
    val windowSizeClass: String,
    val orientation: String,
    val hingePosture: String,
    val isFoldable: Boolean,
    val isTelevision: Boolean,
    val hasTouchscreen: Boolean,
    val hasLeanback: Boolean,
    val widthPx: Int,
    val heightPx: Int,
    val widthDp: Int,
    val heightDp: Int,
    val smallestWidthDp: Int,
    val density: Float,
    val densityDpi: Int,
    val diagonalInches: Double,
    val aspectRatio: Double,
    val displayMode: String,
    val isFullScreen: Boolean
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("deviceType", deviceType)
        put("windowSizeClass", windowSizeClass)
        put("orientation", orientation)
        put("hingePosture", hingePosture)
        put("isFoldable", isFoldable)
        put("isTelevision", isTelevision)
        put("hasTouchscreen", hasTouchscreen)
        put("hasLeanback", hasLeanback)
        put("widthPx", widthPx)
        put("heightPx", heightPx)
        put("widthDp", widthDp)
        put("heightDp", heightDp)
        put("smallestWidthDp", smallestWidthDp)
        put("density", density.toDouble())
        put("densityDpi", densityDpi)
        put("diagonalInches", diagonalInches)
        put("aspectRatio", aspectRatio)
        put("displayMode", displayMode)
        put("isFullScreen", isFullScreen)
    }
}

object AdaptiveDisplayManager {
    private const val PREFS_NAME = "std10_display_settings"
    private const val KEY_DISPLAY_MODE = "display_mode"
    private const val KEY_FULL_SCREEN_V2 = "full_screen_v2"

    fun loadSettings(context: Context): DisplaySettings {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val mode = DisplaySettings.normalizeMode(prefs.getString(KEY_DISPLAY_MODE, DisplaySettings.MODE_AUTO_ADAPTIVE))
        val fullScreen = prefs.getBoolean(KEY_FULL_SCREEN_V2, true)
        return DisplaySettings(displayMode = mode, isFullScreen = fullScreen)
    }

    fun saveDisplayMode(context: Context, mode: String): DisplaySettings {
        val normalized = DisplaySettings.normalizeMode(mode)
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_DISPLAY_MODE, normalized).apply()
        return loadSettings(context)
    }

    fun saveFullScreenMode(context: Context, enabled: Boolean): DisplaySettings {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putBoolean(KEY_FULL_SCREEN_V2, enabled).apply()
        return loadSettings(context)
    }

    fun collectTelemetry(
        activity: ComponentActivity,
        layoutInfo: WindowLayoutInfo? = null,
        settings: DisplaySettings = loadSettings(activity)
    ): NativeDisplayTelemetry {
        val pm = activity.packageManager
        val uiModeManager = activity.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        val currentUiMode = uiModeManager?.currentModeType ?: Configuration.UI_MODE_TYPE_NORMAL
        val isTelevision = currentUiMode == Configuration.UI_MODE_TYPE_TELEVISION ||
            (activity.resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_TELEVISION
        val hasLeanback = pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
        val hasTouchscreen = pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN) ||
            pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN_MULTITOUCH)
        val hasHingeFeature = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            pm.hasSystemFeature(PackageManager.FEATURE_SENSOR_HINGE_ANGLE)
        } else {
            false
        }

        val windowBounds = runCatching {
            WindowMetricsCalculator.getOrCreate().computeCurrentWindowMetrics(activity).bounds
        }.getOrNull()

        val displayMetrics: DisplayMetrics = activity.resources.displayMetrics
        val density = max(displayMetrics.density, 1f)
        val widthPx = windowBounds?.width()?.takeIf { it > 0 } ?: displayMetrics.widthPixels
        val heightPx = windowBounds?.height()?.takeIf { it > 0 } ?: displayMetrics.heightPixels

        val widthDp = (widthPx / density).roundToInt()
        val heightDp = (heightPx / density).roundToInt()
        val smallestWidthDp = activity.resources.configuration.smallestScreenWidthDp
            .takeIf { it > 0 } ?: min(widthDp, heightDp)

        val xDpi = displayMetrics.xdpi.takeIf { it > 40f } ?: displayMetrics.densityDpi.toFloat().coerceAtLeast(160f)
        val yDpi = displayMetrics.ydpi.takeIf { it > 40f } ?: displayMetrics.densityDpi.toFloat().coerceAtLeast(160f)
        val rawDiagInches = hypot((widthPx / xDpi).toDouble(), (heightPx / yDpi).toDouble())
        val fallbackDiagInches = hypot(widthDp.toDouble(), heightDp.toDouble()) / 160.0
        val diagonalInches = ((if (rawDiagInches in 3.5..120.0) rawDiagInches else fallbackDiagInches) * 10.0)
            .roundToInt() / 10.0

        val orientation = if (widthPx >= heightPx) "landscape" else "portrait"
        val maxPx = max(widthPx, heightPx).toDouble()
        val minPx = max(min(widthPx, heightPx), 1).toDouble()
        val aspectRatio = ((maxPx / minPx) * 100.0).roundToInt() / 100.0

        val windowSizeClass = when {
            widthDp >= 1600 -> "xlarge"
            widthDp >= 1200 -> "large"
            widthDp >= 840 -> "expanded"
            widthDp >= 600 -> "medium"
            else -> "compact"
        }

        val foldingFeature = layoutInfo?.displayFeatures
            ?.filterIsInstance<FoldingFeature>()
            ?.firstOrNull()
        val hingePosture = when {
            foldingFeature == null -> "none"
            foldingFeature.state == FoldingFeature.State.HALF_OPENED &&
                foldingFeature.orientation == FoldingFeature.Orientation.HORIZONTAL -> "tabletop"
            foldingFeature.state == FoldingFeature.State.HALF_OPENED &&
                foldingFeature.orientation == FoldingFeature.Orientation.VERTICAL -> "book"
            else -> "flat"
        }
        val isFoldable = foldingFeature != null || hasHingeFeature

        val deviceType = when {
            isTelevision || (hasLeanback && !hasTouchscreen) -> "android_tv"
            hasTouchscreen && (diagonalInches >= 22.0 || (smallestWidthDp >= 900 && widthPx >= 1920 && !isFoldable)) -> "smart_board"
            isFoldable -> "foldable"
            !hasTouchscreen && !isTelevision && widthDp >= 840 -> "landscape_monitor"
            hasTouchscreen && widthDp >= 1100 && diagonalInches >= 13.5 -> "large_touchscreen"
            smallestWidthDp >= 600 -> "tablet"
            !hasTouchscreen -> "landscape_monitor"
            else -> "mobile_phone"
        }

        return NativeDisplayTelemetry(
            deviceType = deviceType,
            windowSizeClass = windowSizeClass,
            orientation = orientation,
            hingePosture = hingePosture,
            isFoldable = isFoldable,
            isTelevision = isTelevision,
            hasTouchscreen = hasTouchscreen,
            hasLeanback = hasLeanback,
            widthPx = widthPx,
            heightPx = heightPx,
            widthDp = widthDp,
            heightDp = heightDp,
            smallestWidthDp = smallestWidthDp,
            density = density,
            densityDpi = displayMetrics.densityDpi,
            diagonalInches = diagonalInches,
            aspectRatio = aspectRatio,
            displayMode = settings.displayMode,
            isFullScreen = settings.isFullScreen
        )
    }

    fun applyActivityDisplaySettings(
        activity: ComponentActivity,
        settings: DisplaySettings,
        telemetry: NativeDisplayTelemetry
    ) {
        val targetOrientation = when (settings.displayMode) {
            DisplaySettings.MODE_PORTRAIT -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
            DisplaySettings.MODE_LANDSCAPE -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            else -> {
                if (telemetry.deviceType in setOf("android_tv", "smart_board", "large_touchscreen", "landscape_monitor")) {
                    ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                } else {
                    ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                }
            }
        }
        if (activity.requestedOrientation != targetOrientation) {
            activity.requestedOrientation = targetOrientation
        }

        val window = activity.window
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val lp = window.attributes
            val desiredCutout = if (settings.isFullScreen) {
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            } else {
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT
            }
            if (lp.layoutInDisplayCutoutMode != desiredCutout) {
                lp.layoutInDisplayCutoutMode = desiredCutout
                window.attributes = lp
            }
        }
        val isNight = (activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = !isNight
        controller.isAppearanceLightNavigationBars = !isNight
        if (settings.isFullScreen) {
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    fun pushTelemetryToWebView(webView: WebView?, telemetry: NativeDisplayTelemetry) {
        if (webView == null) return
        val jsonPayload = telemetry.toJson().toString()
        val js = "window.__onNativeDisplayMetricsChanged && window.__onNativeDisplayMetricsChanged($jsonPayload);"
        webView.post {
            webView.evaluateJavascript(js, null)
        }
    }
}

class AndroidDisplayBridge(
    private val activity: ComponentActivity,
    private val getLayoutInfo: () -> WindowLayoutInfo?,
    private val onSettingsApplied: (DisplaySettings, NativeDisplayTelemetry) -> Unit
) {
    @JavascriptInterface
    fun getDisplayState(): String {
        val settings = AdaptiveDisplayManager.loadSettings(activity)
        val telemetry = AdaptiveDisplayManager.collectTelemetry(activity, getLayoutInfo(), settings)
        return telemetry.toJson().toString()
    }

    @JavascriptInterface
    fun setDisplayMode(mode: String) {
        activity.runOnUiThread {
            val settings = AdaptiveDisplayManager.saveDisplayMode(activity, mode)
            val telemetry = AdaptiveDisplayManager.collectTelemetry(activity, getLayoutInfo(), settings)
            AdaptiveDisplayManager.applyActivityDisplaySettings(activity, settings, telemetry)
            onSettingsApplied(settings, telemetry)
        }
    }

    @JavascriptInterface
    fun setFullScreenMode(enabled: Boolean) {
        activity.runOnUiThread {
            val settings = AdaptiveDisplayManager.saveFullScreenMode(activity, enabled)
            val telemetry = AdaptiveDisplayManager.collectTelemetry(activity, getLayoutInfo(), settings)
            AdaptiveDisplayManager.applyActivityDisplaySettings(activity, settings, telemetry)
            onSettingsApplied(settings, telemetry)
        }
    }
}
