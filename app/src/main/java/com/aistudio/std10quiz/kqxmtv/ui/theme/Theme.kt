package com.aistudio.std10quiz.kqxmtv.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aistudio.std10quiz.kqxmtv.R

private val AnekGujaratiFontFamily = FontFamily(
    Font(R.font.anek_gujarati, FontWeight.Normal),
    Font(R.font.anek_gujarati, FontWeight.Medium),
    Font(R.font.anek_gujarati, FontWeight.Bold)
)

private val BaseTypography = Typography()
private val AppTypography = Typography(
    displayLarge = BaseTypography.displayLarge.copy(fontFamily = AnekGujaratiFontFamily),
    displayMedium = BaseTypography.displayMedium.copy(fontFamily = AnekGujaratiFontFamily),
    displaySmall = BaseTypography.displaySmall.copy(fontFamily = AnekGujaratiFontFamily),
    headlineLarge = BaseTypography.headlineLarge.copy(fontFamily = AnekGujaratiFontFamily),
    headlineMedium = BaseTypography.headlineMedium.copy(fontFamily = AnekGujaratiFontFamily),
    headlineSmall = BaseTypography.headlineSmall.copy(fontFamily = AnekGujaratiFontFamily),
    titleLarge = BaseTypography.titleLarge.copy(fontFamily = AnekGujaratiFontFamily),
    titleMedium = BaseTypography.titleMedium.copy(fontFamily = AnekGujaratiFontFamily),
    titleSmall = BaseTypography.titleSmall.copy(fontFamily = AnekGujaratiFontFamily),
    bodyLarge = TextStyle(
        fontFamily = AnekGujaratiFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp
    ),
    bodyMedium = BaseTypography.bodyMedium.copy(fontFamily = AnekGujaratiFontFamily),
    bodySmall = BaseTypography.bodySmall.copy(fontFamily = AnekGujaratiFontFamily),
    labelLarge = BaseTypography.labelLarge.copy(fontFamily = AnekGujaratiFontFamily),
    labelMedium = BaseTypography.labelMedium.copy(fontFamily = AnekGujaratiFontFamily),
    labelSmall = BaseTypography.labelSmall.copy(fontFamily = AnekGujaratiFontFamily)
)

private val RoyalBlue = Color(0xFF1E3A8A)
private val Emerald = Color(0xFF047857)
private val WarmAmber = Color(0xFFD97706)
private val CreamSurface = Color(0xFFFAF9F5)
private val SlateInk = Color(0xFF0F172A)
private val DarkSurface = Color(0xFF0B1120)
private val DarkCard = Color(0xFF1E293B)

private val LightColors = lightColorScheme(
    primary = RoyalBlue,
    onPrimary = Color.White,
    secondary = Emerald,
    onSecondary = Color.White,
    tertiary = WarmAmber,
    background = CreamSurface,
    onBackground = SlateInk,
    surface = CreamSurface,
    onSurface = SlateInk
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF93C5FD),
    onPrimary = DarkSurface,
    secondary = Color(0xFF6EE7B7),
    onSecondary = DarkSurface,
    tertiary = Color(0xFFFCD34D),
    background = DarkSurface,
    onBackground = Color(0xFFF8FAFC),
    surface = DarkCard,
    onSurface = Color(0xFFF8FAFC)
)

private val AppShapes = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp)
)

@Composable
fun Std10QuizTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = AppTypography,
        shapes = AppShapes,
        content = content
    )
}
