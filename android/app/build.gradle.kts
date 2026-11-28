plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/* 서명: GitHub Secrets(ANDROID_KEYSTORE_B64 → CI가 파일로 풀어 둠)가 있으면 그 열쇠로,
   없으면 디버그 열쇠로 서명한다. 열쇠 값은 저장소에 두지 않는다. */
val ksFile = System.getenv("WITW_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }

android {
    namespace = "dev.witw.widget"
    compileSdk = 35
    defaultConfig {
        applicationId = "dev.witw.widget"
        minSdk = 29
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }
    signingConfigs {
        if (ksFile != null) create("witw") {
            storeFile = ksFile
            storePassword = System.getenv("WITW_KEYSTORE_PASS")
            keyAlias = System.getenv("WITW_KEY_ALIAS") ?: "witw"
            keyPassword = System.getenv("WITW_KEYSTORE_PASS")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = if (ksFile != null) signingConfigs.getByName("witw") else signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
