plugins {
    id("com.android.application")
}

android {
    namespace = "com.lordofrealms.padgrade"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.lordofrealms.padgrade"
        minSdk = 31
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    // One source tree, two targets: GitHub Pages publishes ../pad-grade and the
    // APK packages that exact directory directly as its asset root. No copied or
    // generated HTML/JS tree exists for Android.
    sourceSets["main"].assets.srcDir(rootProject.projectDir.resolve("../pad-grade"))
}

dependencies {
    implementation("androidx.webkit:webkit:1.17.0")
}
