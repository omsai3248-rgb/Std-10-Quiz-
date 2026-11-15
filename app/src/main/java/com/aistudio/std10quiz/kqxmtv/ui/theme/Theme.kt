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
import androidx.compose.ui.unit.dp

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
        typography = Typography(),
        shapes = AppShapes,
        content = content
    )
}
