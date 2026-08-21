#include <jni.h>
#include <android/log.h>

#include "mrtklib/mrtk_ppp.h"

static int g_valid_adr = 0;
static int g_multi_frequency = 0;
static long g_has_bytes = 0;

JNIEXPORT jstring JNICALL
Java_com_lordofrealms_precisionlocation_AutoPppEngine_nativeEngineInfo(
        JNIEnv *env, jclass clazz) {
    (void) clazz;
    return (*env)->NewStringUTF(env, "MRTKLIB PPP/HAS native engine • automatic SF/DF/MF");
}

JNIEXPORT void JNICALL
Java_com_lordofrealms_precisionlocation_AutoPppEngine_nativeReset(
        JNIEnv *env, jclass clazz) {
    (void) env; (void) clazz;
    g_valid_adr = 0;
    g_multi_frequency = 0;
    g_has_bytes = 0;
}

JNIEXPORT void JNICALL
Java_com_lordofrealms_precisionlocation_AutoPppEngine_nativeObserveCapability(
        JNIEnv *env, jclass clazz, jint valid_adr, jboolean multi_frequency) {
    (void) env; (void) clazz;
    g_valid_adr = valid_adr;
    g_multi_frequency = multi_frequency ? 1 : 0;
}

JNIEXPORT void JNICALL
Java_com_lordofrealms_precisionlocation_AutoPppEngine_nativeNavigationMessage(
        JNIEnv *env, jclass clazz, jint type, jint svid, jint message_id,
        jint submessage_id, jbyteArray data) {
    (void) env; (void) clazz; (void) type; (void) svid;
    (void) message_id; (void) submessage_id; (void) data;
    /* Android navigation-message -> MRTKLIB nav_t decoder bridge goes here. */
}

JNIEXPORT void JNICALL
Java_com_lordofrealms_precisionlocation_AutoPppEngine_nativeHasBytes(
        JNIEnv *env, jclass clazz, jbyteArray data, jint length) {
    (void) env; (void) clazz; (void) data;
    if (length > 0) g_has_bytes += length;
    /* IDD framing remains outside the estimator. Decoded HAS SSR will populate
       MRTKLIB correction state before pppos() is called. */
}
