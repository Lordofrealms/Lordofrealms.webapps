plugins {
    id("com.android.application")
}

android {
    namespace = "com.lordofrealms.precisionlocation"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.lordofrealms.precisionlocation"
        minSdk = 31
        targetSdk = 36
        versionCode = 3
        versionName = "0.3.0"

        ndk {
            abiFilters += listOf("arm64-v8a")
        }

        externalNativeBuild {
            cmake {
                arguments += listOf("-DANDROID_STL=c++_static")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }
}

dependencies {
    implementation("com.google.android.gms:play-services-location:21.4.0")
}
