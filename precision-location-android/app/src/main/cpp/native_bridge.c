#include <jni.h>
#include <android/log.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "mrtklib/mrtk_const.h"
#include "mrtklib/mrtk_nav.h"
#include "mrtklib/mrtk_obs.h"
#include "mrtklib/mrtk_ppp.h"
#include "mrtklib/mrtk_rtcm.h"
#include "mrtklib/mrtk_time.h"

#define LOG_TAG "PrecisionLocation"
#define A_GPS 1
#define A_GAL 6
#define A_ADR_VALID 1
#define A_ADR_RESET 2
#define A_ADR_CYCLE_SLIP 4
#define A_ADR_HALF_RESOLVED 8
#define A_ADR_HALF_REPORTED 16
#define OBS_SLOTS (NFREQ + NEXOBS)

static int g_valid_adr = 0;
static int g_multi_frequency = 0;
static long g_has_bytes = 0;
static long g_ssr_messages = 0;
static int g_last_hw_disc = -1;
static unsigned long g_clock_resets = 0;
static obsd_t g_epoch_obs[MAXSAT];
static int g_epoch_n = 0;
static int g_epoch_signals = 0;
static int g_epoch_phase = 0;
static int g_epoch_dropped = 0;
static char g_obs_info[192] = "waiting for raw observations";
static rtcm_t g_rtcm;
static int g_rtcm_initialized = 0;

static int android_to_sys(int constellation) {
    if (constellation == A_GPS) return SYS_GPS;
    if (constellation == A_GAL) return SYS_GAL;
    return SYS_NONE;
}

static int near_hz(double f, double target, double tolerance) {
    return isfinite(f) && fabs(f - target) <= tolerance;
}

static int rinex_band_digit(int sys, double f) {
    const double tol = 3.0e6;
    if (near_hz(f, FREQ1, tol)) return 1;
    if (sys == SYS_GPS && near_hz(f, FREQ2, tol)) return 2;
    if (near_hz(f, FREQ5, tol)) return 5;
    if (sys == SYS_GAL && near_hz(f, FREQ6, tol)) return 6;
    if (sys == SYS_GAL && near_hz(f, FREQ7, tol)) return 7;
    if (sys == SYS_GAL && near_hz(f, FREQ8, tol)) return 8;
    return 0;
}

static char fallback_attribute(int sys, int band) {
    if (sys == SYS_GPS) {
        if (band == 1) return 'C';
        if (band == 2) return 'W';
        if (band == 5) return 'X';
    }
    if (sys == SYS_GAL) {
        if (band == 1) return 'X';
        if (band == 5 || band == 7 || band == 8 || band == 6) return 'X';
    }
    return 'X';
}

static uint8_t android_obs_code(JNIEnv *env, int sys, int band, jstring jcode) {
    char attr = '\0';
    if (jcode != NULL) {
        const char *s = (*env)->GetStringUTFChars(env, jcode, NULL);
        if (s != NULL) {
            if (s[0] && strcmp(s, "UNKNOWN") != 0) attr = s[0];
            (*env)->ReleaseStringUTFChars(env, jcode, s);
        }
    }
    if (!attr) attr = fallback_attribute(sys, band);

    char rinex[3];
    rinex[0] = (char)('0' + band);
    rinex[1] = attr;
    rinex[2] = '\0';
    uint8_t code = obs2code(rinex);
    if (code == CODE_NONE) {
        rinex[1] = fallback_attribute(sys, band);
        code = obs2code(rinex);
    }
    return code;
}

static int find_or_add_sat(int sat, gtime_t t) {
    int i;
    for (i = 0; i < g_epoch_n; i++) {
        if (g_epoch_obs[i].sat == sat) return i;
    }
    if (g_epoch_n >= MAXSAT) return -1;
    i = g_epoch_n++;
    memset(&g_epoch_obs[i], 0, sizeof(obsd_t));
    g_epoch_obs[i].time = t;
    g_epoch_obs[i].sat = (uint8_t)sat;
    g_epoch_obs[i].rcv = 1;
    return i;
}

static int min_len(JNIEnv *env, jarray first, const jarray *others, int nothers) {
    int n = first ? (int)(*env)->GetArrayLength(env, first) : 0;
    int i;
    for (i = 0; i < nothers; i++) {
        int m = others[i] ? (int)(*env)->GetArrayLength(env, others[i]) : 0;
        if (m < n) n = m;
    }
    return n;
}

static void reset_rtcm_decoder(void) {
    if (g_rtcm_initialized) {
        free_rtcm(&g_rtcm);
        g_rtcm_initialized = 0;
    }
    memset(&g_rtcm, 0, sizeof(g_rtcm));
    if (init_rtcm(&g_rtcm)) {
        g_rtcm_initialized = 1;
    } else {
        __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, "init_rtcm failed");
    }
}

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
    g_ssr_messages = 0;
    g_last_hw_disc = -1;
    g_clock_resets = 0;
    g_epoch_n = g_epoch_signals = g_epoch_phase = g_epoch_dropped = 0;
    memset(g_epoch_obs, 0, sizeof(g_epoch_obs));
    reset_obsdef();
    reset_rtcm_decoder();
    snprintf(g_obs_info, sizeof(g_obs_info), "waiting for raw observations");
}

JNIEXPORT void JNICALL
Java_com_lordofrealms_precisionlocation_AutoPppEngine_nativeObserveCapability(
        JNIEnv *env, jclass clazz, jint valid_adr, jboolean multi_frequency) {
    (void) env; (void) clazz;
    g_valid_adr = valid_adr;
    g_multi_frequency = multi_frequency ? 1 : 0;
}

JNIEXPORT jint JNICALL
Java_com_lordofrealms_precisionlocation_AutoPppEngine_nativeObservationEpoch(
        JNIEnv *env, jclass clazz, jint gps_week, jdouble gps_tow_seconds,
        jint hw_disc, jintArray constellation, jintArray svid,
        jdoubleArray frequency_hz, jobjectArray code_type,
        jdoubleArray pseudorange_m, jdoubleArray pseudorange_sigma_m,
        jdoubleArray adr_m, jdoubleArray adr_sigma_m,
        jdoubleArray range_rate_mps, jdoubleArray range_rate_sigma_mps,
        jdoubleArray cn0_dbhz, jintArray adr_state, jintArray sync_state) {
    (void)clazz; (void)pseudorange_sigma_m; (void)adr_sigma_m;
    (void)range_rate_sigma_mps; (void)sync_state;

    const jarray rest[] = {
        (jarray)svid, (jarray)frequency_hz, (jarray)code_type,
        (jarray)pseudorange_m, (jarray)pseudorange_sigma_m,
        (jarray)adr_m, (jarray)adr_sigma_m, (jarray)range_rate_mps,
        (jarray)range_rate_sigma_mps, (jarray)cn0_dbhz,
        (jarray)adr_state, (jarray)sync_state
    };
    int n = min_len(env, (jarray)constellation, rest, (int)(sizeof(rest)/sizeof(rest[0])));
    if (gps_week < 0 || !isfinite(gps_tow_seconds) || n <= 0) {
        g_epoch_n = g_epoch_signals = g_epoch_phase = 0;
        snprintf(g_obs_info, sizeof(g_obs_info), "no usable GPS/Galileo epoch");
        return 0;
    }

    jint *c = (*env)->GetIntArrayElements(env, constellation, NULL);
    jint *sv = (*env)->GetIntArrayElements(env, svid, NULL);
    jdouble *freq = (*env)->GetDoubleArrayElements(env, frequency_hz, NULL);
    jdouble *pr = (*env)->GetDoubleArrayElements(env, pseudorange_m, NULL);
    jdouble *adr = (*env)->GetDoubleArrayElements(env, adr_m, NULL);
    jdouble *rate = (*env)->GetDoubleArrayElements(env, range_rate_mps, NULL);
    jdouble *cn0 = (*env)->GetDoubleArrayElements(env, cn0_dbhz, NULL);
    jint *astate = (*env)->GetIntArrayElements(env, adr_state, NULL);
    if (!c || !sv || !freq || !pr || !adr || !rate || !cn0 || !astate) {
        if (c) (*env)->ReleaseIntArrayElements(env, constellation, c, JNI_ABORT);
        if (sv) (*env)->ReleaseIntArrayElements(env, svid, sv, JNI_ABORT);
        if (freq) (*env)->ReleaseDoubleArrayElements(env, frequency_hz, freq, JNI_ABORT);
        if (pr) (*env)->ReleaseDoubleArrayElements(env, pseudorange_m, pr, JNI_ABORT);
        if (adr) (*env)->ReleaseDoubleArrayElements(env, adr_m, adr, JNI_ABORT);
        if (rate) (*env)->ReleaseDoubleArrayElements(env, range_rate_mps, rate, JNI_ABORT);
        if (cn0) (*env)->ReleaseDoubleArrayElements(env, cn0_dbhz, cn0, JNI_ABORT);
        if (astate) (*env)->ReleaseIntArrayElements(env, adr_state, astate, JNI_ABORT);
        return 0;
    }

    int clock_jump = 0;
    if (g_last_hw_disc >= 0 && hw_disc != g_last_hw_disc) {
        clock_jump = 1;
        g_clock_resets++;
    }
    g_last_hw_disc = hw_disc;
    g_epoch_n = g_epoch_signals = g_epoch_phase = g_epoch_dropped = 0;
    memset(g_epoch_obs, 0, sizeof(g_epoch_obs));
    gtime_t epoch_time = gpst2time((int)gps_week, (double)gps_tow_seconds);

    int i;
    for (i = 0; i < n; i++) {
        int sys = android_to_sys(c[i]);
        int band = rinex_band_digit(sys, freq[i]);
        if (sys == SYS_NONE || band == 0 || !isfinite(pr[i])) {
            g_epoch_dropped++;
            continue;
        }
        jstring jc = (jstring)(*env)->GetObjectArrayElement(env, code_type, i);
        uint8_t code = android_obs_code(env, sys, band, jc);
        if (jc) (*env)->DeleteLocalRef(env, jc);
        if (code == CODE_NONE) {
            g_epoch_dropped++;
            continue;
        }
        int slot = code2freq_idx(sys, code);
        if (slot < 0 || slot >= OBS_SLOTS) {
            g_epoch_dropped++;
            continue;
        }
        int sat = satno(sys, sv[i]);
        if (sat <= 0) {
            g_epoch_dropped++;
            continue;
        }
        int oi = find_or_add_sat(sat, epoch_time);
        if (oi < 0) {
            g_epoch_dropped++;
            continue;
        }
        obsd_t *o = &g_epoch_obs[oi];

        /* If two Android observables compete for one physical slot, keep the
           observation code MRTKLIB itself ranks more highly. */
        if (o->code[slot] != CODE_NONE
                && getcodepri(sys, o->code[slot], "") >= getcodepri(sys, code, "")) {
            continue;
        }

        const double wavelength = CLIGHT / freq[i];
        o->P[slot] = pr[i];
        o->code[slot] = code;
        if (isfinite(rate[i]) && wavelength > 0.0) {
            o->D[slot] = (float)(-rate[i] / wavelength);
        }
        if (isfinite(cn0[i])) {
            long snr = lround(cn0[i] * 1000.0);
            if (snr < 0) snr = 0;
            if (snr > 65535) snr = 65535;
            o->SNR[slot] = (uint16_t)snr;
        }

        int phase_valid = (astate[i] & A_ADR_VALID) && isfinite(adr[i]) && wavelength > 0.0;
        if (phase_valid) {
            o->L[slot] = adr[i] / wavelength;
            g_epoch_phase++;
        } else {
            o->L[slot] = 0.0;
        }
        if (clock_jump || (astate[i] & (A_ADR_RESET | A_ADR_CYCLE_SLIP))) {
            o->LLI[slot] |= 1; /* loss of lock / ambiguity reset */
        }
        if ((astate[i] & A_ADR_HALF_REPORTED) && !(astate[i] & A_ADR_HALF_RESOLVED)) {
            o->LLI[slot] |= 2; /* half-cycle ambiguity unresolved */
        }
        g_epoch_signals++;
    }

    (*env)->ReleaseIntArrayElements(env, constellation, c, JNI_ABORT);
    (*env)->ReleaseIntArrayElements(env, svid, sv, JNI_ABORT);
    (*env)->ReleaseDoubleArrayElements(env, frequency_hz, freq, JNI_ABORT);
    (*env)->ReleaseDoubleArrayElements(env, pseudorange_m, pr, JNI_ABORT);
    (*env)->ReleaseDoubleArrayElements(env, adr_m, adr, JNI_ABORT);
    (*env)->ReleaseDoubleArrayElements(env, range_rate_mps, rate, JNI_ABORT);
    (*env)->ReleaseDoubleArrayElements(env, cn0_dbhz, cn0, JNI_ABORT);
    (*env)->ReleaseIntArrayElements(env, adr_state, astate, JNI_ABORT);

    snprintf(g_obs_info, sizeof(g_obs_info),
             "%d signals, %d phase, %d satellites, %d dropped%s",
             g_epoch_signals, g_epoch_phase, g_epoch_n, g_epoch_dropped,
             clock_jump ? " • receiver clock reset" : "");
    return g_epoch_n;
}

JNIEXPORT jstring JNICALL
Java_com_lordofrealms_precisionlocation_AutoPppEngine_nativeObservationInfo(
        JNIEnv *env, jclass clazz) {
    (void)clazz;
    return (*env)->NewStringUTF(env, g_obs_info);
}

JNIEXPORT void JNICALL
Java_com_lordofrealms_precisionlocation_AutoPppEngine_nativeNavigationMessage(
        JNIEnv *env, jclass clazz, jint type, jint svid, jint message_id,
        jint submessage_id, jbyteArray data) {
    (void) env; (void) clazz; (void) type; (void) svid;
    (void) message_id; (void) submessage_id; (void) data;
    /* Android navigation-message -> MRTKLIB nav_t decoder bridge follows next. */
}

JNIEXPORT jint JNICALL
Java_com_lordofrealms_precisionlocation_AutoPppEngine_nativeHasBytes(
        JNIEnv *env, jclass clazz, jbyteArray data, jint length) {
    (void)clazz;
    if (!g_rtcm_initialized || !data || length <= 0) return 0;
    jsize available = (*env)->GetArrayLength(env, data);
    int n = length < available ? length : available;
    jbyte *bytes = (*env)->GetByteArrayElements(env, data, NULL);
    if (!bytes) return 0;

    int decoded = 0;
    int i;
    for (i = 0; i < n; i++) {
        int status = input_rtcm3(&g_rtcm, (uint8_t)bytes[i]);
        if (status == 10) {
            decoded++;
            g_ssr_messages++;
        }
    }
    g_has_bytes += n;
    (*env)->ReleaseByteArrayElements(env, data, bytes, JNI_ABORT);
    return decoded;
}
