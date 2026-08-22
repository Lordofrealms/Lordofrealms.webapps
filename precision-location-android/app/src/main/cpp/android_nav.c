#include "android_nav.h"

#include <string.h>

#include "mrtklib/mrtk_bits.h"
#include "mrtklib/mrtk_const.h"
#include "mrtklib/mrtk_rcvraw.h"

#define ANDROID_TYPE_GPS_L1CA 257
#define ANDROID_TYPE_GAL_I    1537
#define ANDROID_PARITY_PASSED 1
#define ANDROID_PARITY_REBUILT 2

/* MRTKLIB decoders want parity/CRC-checked, compact navigation words. */
static uint8_t gps_lnav[MAXSAT][90];      /* subframes 1..3, 30 bytes each */
static uint8_t gps_mask[MAXSAT];
static uint8_t gal_inav[MAXSAT][112];     /* word types 0..6, 16 bytes each */
static uint8_t gal_mask[MAXSAT];

void android_nav_reset(void) {
    memset(gps_lnav, 0, sizeof(gps_lnav));
    memset(gps_mask, 0, sizeof(gps_mask));
    memset(gal_inav, 0, sizeof(gal_inav));
    memset(gal_mask, 0, sizeof(gal_mask));
}

static uint32_t be32(const uint8_t *p) {
    return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) |
           ((uint32_t)p[2] << 8) | (uint32_t)p[3];
}

/* Android gives each GPS word in the low 30 bits of a 32-bit big-endian word.
 * decode_word() wants the previous word's D29-star and D30-star bits in the
 * upper two bits. For word 1 those belong to the previous subframe and Android
 * omits them, so try all four possibilities and accept the parity-valid one
 * that also yields the GPS TLM preamble. */
static int compact_gps_subframe(const uint8_t *data, int length, uint8_t out[30]) {
    uint32_t words[10];
    int i, prefix = -1;
    uint8_t first[3];

    if (!data || length < 40) return 0;
    for (i = 0; i < 10; i++) words[i] = be32(data + i * 4) & 0x3FFFFFFFU;

    for (i = 0; i < 4; i++) {
        if (decode_word(((uint32_t)i << 30) | words[0], first) && first[0] == 0x8B) {
            prefix = i;
            break;
        }
    }
    if (prefix < 0) return 0;
    memcpy(out, first, 3);

    for (i = 1; i < 10; i++) {
        uint32_t previous_d29_d30 = words[i - 1] & 0x3U;
        if (!decode_word((previous_d29_d30 << 30) | words[i], out + i * 3)) return 0;
    }
    return 1;
}

static int feed_gps(int svid, int submessage_id, const uint8_t *data, int length, eph_t *out_eph) {
    int sat = satno(SYS_GPS, svid);
    uint8_t compact[30];
    eph_t eph = {0};

    if (sat <= 0 || submessage_id < 1 || submessage_id > 5) return -1;
    if (!compact_gps_subframe(data, length, compact)) return -1;
    if ((int)getbitu(compact, 43, 3) != submessage_id) return -1;

    if (submessage_id <= 3) {
        memcpy(gps_lnav[sat - 1] + (submessage_id - 1) * 30, compact, 30);
        gps_mask[sat - 1] |= (uint8_t)(1U << (submessage_id - 1));
    }
    if ((gps_mask[sat - 1] & 0x07U) != 0x07U) return 0;
    if (!decode_frame(gps_lnav[sat - 1], &eph, NULL, NULL, NULL)) return 0;
    eph.sat = sat;
    *out_eph = eph;
    return 1;
}

/* Android packs I/NAV as 114 even bits followed immediately by 114 odd bits.
 * MRTKLIB's u-blox path operates on those same page parts padded to 128 bits
 * each, then saves 112 even + 16 odd information bits as a 128-bit word. */
static int compact_gal_word(const uint8_t *data, int length, uint8_t word[16], int *word_type) {
    uint8_t padded[32] = {0};
    uint8_t crc_buff[26] = {0};
    int i, j, part1, page1, part2, page2, type;

    if (!data || length < 29) return 0;
    for (i = 0; i < 114; i++) setbitu(padded, i, 1, getbitu(data, i, 1));
    for (i = 0; i < 114; i++) setbitu(padded, 128 + i, 1, getbitu(data, 114 + i, 1));

    part1 = (int)getbitu(padded, 0, 1);
    page1 = (int)getbitu(padded, 1, 1);
    part2 = (int)getbitu(padded, 128, 1);
    page2 = (int)getbitu(padded, 129, 1);
    if (part1 != 0 || part2 != 1 || page1 == 1 || page2 == 1) return 0;

    /* Same CRC construction used by MRTKLIB's u-blox Galileo I/NAV decoder. */
    for (i = 0, j = 4; i < 15; i++, j += 8)
        setbitu(crc_buff, j, 8, getbitu(padded, i * 8, 8));
    for (i = 0, j = 118; i < 11; i++, j += 8)
        setbitu(crc_buff, j, 8, getbitu(padded, i * 8 + 128, 8));
    if (rtk_crc24q(crc_buff, 25) != getbitu(padded, 128 + 82, 24)) return 0;

    type = (int)getbitu(padded, 2, 6);
    if (type < 0 || type > 6) return 0;
    memset(word, 0, 16);
    for (i = 0, j = 2; i < 14; i++, j += 8)
        word[i] = (uint8_t)getbitu(padded, j, 8);
    for (i = 14, j = 130; i < 16; i++, j += 8)
        word[i] = (uint8_t)getbitu(padded, j, 8);
    *word_type = type;
    return 1;
}

static int feed_gal(int svid, int submessage_id, const uint8_t *data, int length, eph_t *out_eph) {
    int sat = satno(SYS_GAL, svid), type;
    uint8_t word[16];
    eph_t eph = {0};

    if (sat <= 0 || !compact_gal_word(data, length, word, &type)) return -1;
    (void)submessage_id; /* Embedded word type is authoritative for Galileo. */
    if (type > 6) return 0;

    memcpy(gal_inav[sat - 1] + type * 16, word, 16);
    if (type >= 1 && type <= 5) gal_mask[sat - 1] |= (uint8_t)(1U << (type - 1));
    if ((gal_mask[sat - 1] & 0x1FU) != 0x1FU) return 0;
    if (!decode_gal_inav(gal_inav[sat - 1], &eph, NULL, NULL)) return 0;
    if (eph.sat != sat) return -1;
    eph.code |= (1 << 0) | (1 << 2); /* I/NAV source: E1 + E5b convention */
    *out_eph = eph;
    return 1;
}

int android_nav_feed(int type, int svid, int submessage_id, int status,
                     const uint8_t *data, int length, eph_t *out_eph) {
    if (!out_eph || !data || length <= 0) return -1;
    if (status != 0 && status != ANDROID_PARITY_PASSED && status != ANDROID_PARITY_REBUILT)
        return -1;

    if (type == ANDROID_TYPE_GPS_L1CA)
        return feed_gps(svid, submessage_id, data, length, out_eph);
    if (type == ANDROID_TYPE_GAL_I)
        return feed_gal(svid, submessage_id, data, length, out_eph);
    return 0;
}
