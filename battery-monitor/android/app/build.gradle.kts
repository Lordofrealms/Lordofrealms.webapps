plugins {
    id("com.android.application")
}

android {
    namespace = "com.lordofrealms.batterymonitorsetup"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.lordofrealms.batterymonitorsetup"
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

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.github.espressif:esp-idf-provisioning-android:lib-2.4.4")
    implementation("com.github.yuriy-budiyev:code-scanner:2.3.0")
    implementation("org.greenrobot:eventbus:3.3.1")
}
