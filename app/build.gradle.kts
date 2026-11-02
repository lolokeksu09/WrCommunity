plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val signingKeystorePath = providers.environmentVariable("ANDROID_SIGNING_KEYSTORE_PATH").orNull
val signingStorePassword = providers.environmentVariable("ANDROID_SIGNING_STORE_PASSWORD").orNull
val signingKeyPassword = providers.environmentVariable("ANDROID_SIGNING_KEY_PASSWORD").orNull
val signingEnabled = !signingKeystorePath.isNullOrBlank() &&
    !signingStorePassword.isNullOrBlank() && !signingKeyPassword.isNullOrBlank()

android {
    signingConfigs {
        if (signingEnabled) {
            create("privateRelease") {
                storeFile = file(signingKeystorePath!!)
                storePassword = signingStorePassword
                keyAlias = "android-3d-editor"
                keyPassword = signingKeyPassword
            }
        }
    }
    namespace = "com.wrcommunity.editor"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.wrcommunity.editor.stable"
        minSdk = 26
        targetSdk = 36
        versionCode = 9
        versionName = "0.4.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    buildFeatures {
        compose = true
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            if (signingEnabled) signingConfig = signingConfigs.getByName("privateRelease")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.06.01"))
    implementation("androidx.activity:activity-compose:1.12.4")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("io.github.sceneview:sceneview:4.26.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
