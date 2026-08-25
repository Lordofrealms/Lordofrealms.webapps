plugins {
    id("com.android.application")
}

val padGradeDevBuild = providers.gradleProperty("padGradeDevBuild").orNull == "true"

android {
    namespace = "com.lordofrealms.padgrade"
    compileSdk = 36

    defaultConfig {
        // Stable is the source-tree default. CI passes -PpadGradeDevBuild=true
        // on pad-grade-dev so DEV installs beside the stable package.
        applicationId = if (padGradeDevBuild) "com.lordofrealms.padgrade.dev" else "com.lordofrealms.padgrade"
        manifestPlaceholders["appLabel"] = if (padGradeDevBuild) "Pad Grade DEV" else "Pad Grade"
        minSdk = 31
        targetSdk = 36
        versionCode = 42
        versionName = "0.7.5"
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
