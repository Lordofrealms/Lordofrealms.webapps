# Keep JavaScript interface methods if release minification is enabled later.
-keepclassmembers class com.lordofrealms.padgrade.PadGradeNativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
