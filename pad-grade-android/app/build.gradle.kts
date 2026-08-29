import java.net.URI
import java.nio.file.Files
import java.nio.file.StandardCopyOption

plugins {
    id("com.android.application")
}

val padGradeDevBuild = providers.gradleProperty("padGradeDevBuild").orNull == "true"
val mapLibreVersion = "5.16.0"
val mapLibreVendorDir = rootProject.projectDir.resolve("../pad-grade/vendor")

val stagePinnedMapLibre by tasks.registering {
    group = "build setup"
    description = "Stage pinned MapLibre GL JS/CSS into Pad Grade Android assets"
    val js = mapLibreVendorDir.resolve("maplibre-gl.js")
    val css = mapLibreVendorDir.resolve("maplibre-gl.css")
    val license = mapLibreVendorDir.resolve("MAPLIBRE-LICENSE.txt")
    outputs.files(js, css, license)
    doLast {
        mapLibreVendorDir.mkdirs()
        fun download(relative: String, target: java.io.File) {
            val url = URI("https://unpkg.com/maplibre-gl@$mapLibreVersion/dist/$relative").toURL()
            url.openStream().use { input ->
                Files.copy(input, target.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
            check(target.isFile && target.length() > 100) { "Pinned MapLibre asset missing or empty: ${target.name}" }
        }
        download("maplibre-gl.js", js)
        download("maplibre-gl.css", css)
        download("LICENSE.txt", license)
        check(js.length() > 500_000) { "MapLibre JS staging looks incomplete" }
        check(css.length() > 20_000) { "MapLibre CSS staging looks incomplete" }
    }
}

tasks.matching { it.name == "preBuild" }.configureEach {
    dependsOn(stagePinnedMapLibre)
}

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
        versionCode = 62
        versionName = "0.9.5"
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
