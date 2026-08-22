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

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/padGradeAssets"))
}

val syncPadGradeWeb by tasks.registering(Copy::class) {
    description = "Copies the canonical pad-grade web app into Android assets"
    from(rootProject.projectDir.resolve("../pad-grade"))
    into(layout.buildDirectory.dir("generated/padGradeAssets/pad-grade"))
}

tasks.configureEach {
    if (name.startsWith("merge") && name.endsWith("Assets")) {
        dependsOn(syncPadGradeWeb)
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.17.0")
}
