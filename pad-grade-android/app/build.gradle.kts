plugins {
    id("com.android.application")
}

android {
    namespace = "com.lordofrealms.padgrade"
    compileSdk = 36

    defaultConfig {
        // Dev builds intentionally use a different package so they can be
        // installed beside the stable main-branch app without replacing its
        // local project data or blocking a rollback to the stable version.
        applicationId = "com.lordofrealms.padgrade.dev"
        minSdk = 31
        targetSdk = 36
        versionCode = 32
        versionName = "0.6.5"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    sourceSets["main"].assets.srcDir(rootProject.projectDir.resolve("../pad-grade"))
}

dependencies {
    implementation("androidx.webkit:webkit:1.17.0")
    implementation("androidx.documentfile:documentfile:1.1.0")
}
