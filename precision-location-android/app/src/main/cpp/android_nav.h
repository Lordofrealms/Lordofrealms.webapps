#ifndef PRECISION_LOCATION_ANDROID_NAV_H
#define PRECISION_LOCATION_ANDROID_NAV_H

#include <stdint.h>
#include "mrtklib/mrtk_nav.h"

#ifdef __cplusplus
extern "C" {
#endif

void android_nav_reset(void);

/* Feed one Android GnssNavigationMessage payload.
 * Returns 1 when a complete broadcast ephemeris is decoded into out_eph,
 * 0 when more pages/subframes are needed, -1 for an invalid/rejected message. */
int android_nav_feed(int type, int svid, int submessage_id, int status,
                     const uint8_t *data, int length, eph_t *out_eph);

#ifdef __cplusplus
}
#endif

#endif
