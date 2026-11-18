plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.services) apply false
}

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.aistudio.std10quiz.kqxmtv"
    compileSdk = 36

    val resolvedVersionCode = (project.findProperty("appVersionCode") as? String)
        ?.trim()
        ?.toIntOrNull()
        ?.coerceAtLeast(1)
        ?: 1
    val resolvedVersionName = (project.findProperty("appVersionName") as? String)
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?: "1.0.0"

    defaultConfig {
        applicationId = "com.aistudio.std10quiz.kqxmtv"
        minSdk = 24
        targetSdk = 36
        versionCode = resolvedVersionCode
        versionName = resolvedVersionName
    }

    val keystoreFile = rootProject.file("debug.keystore")
    signingConfigs {
        if (keystoreFile.exists()) {
            create("debugConfig") {
                storeFile = keystoreFile
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }

    buildTypes {
        debug {
            if (keystoreFile.exists()) {
                signingConfig = signingConfigs.getByName("debugConfig")
            }
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (keystoreFile.exists()) {
                signingConfig = signingConfigs.getByName("debugConfig")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.material3.windowsize)
    implementation(libs.androidx.constraintlayout.compose)
    implementation(libs.androidx.window)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.auth)
    implementation(libs.firebase.messaging)
    implementation(libs.firebase.storage)
    implementation(libs.firebase.ai)
    implementation(libs.firebase.appcheck.recaptcha)
    implementation(libs.firebase.appcheck.debug)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.googleid)
}
