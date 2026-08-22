cmake_minimum_required(VERSION 3.22.1)
project(precision_location C)

include(FetchContent)
find_package(Git REQUIRED)

# Pin the GNSS engine so field behavior does not silently change between builds.
FetchContent_Declare(
    mrtklib_src
    GIT_REPOSITORY https://github.com/h-shiono/MRTKLIB.git
    GIT_TAG d0f56fe6a67612efcb1fa448ec2923d1eae23c1a
    GIT_SHALLOW FALSE
)
FetchContent_GetProperties(mrtklib_src)
if(NOT mrtklib_src_POPULATED)
    FetchContent_Populate(mrtklib_src)
endif()

# Android needs uncombined PPP to accept a genuine one-frequency epoch, plus a
# small Android-specific weighting patch so conditioned smartphone C/N0/code
# uncertainty changes both broadcast-SPP and HAS-PPP variance. Keep the two
# concerns separate and apply them together against the pinned upstream commit.
set(MRTKLIB_ANDROID_PATCHES
    "${CMAKE_CURRENT_LIST_DIR}/patches/mrtklib-uncombined-single-frequency.patch"
    "${CMAKE_CURRENT_LIST_DIR}/patches/mrtklib-android-smartphone-weighting.patch"
)
execute_process(
    COMMAND "${GIT_EXECUTABLE}" apply --reverse --check ${MRTKLIB_ANDROID_PATCHES}
    WORKING_DIRECTORY "${mrtklib_src_SOURCE_DIR}"
    RESULT_VARIABLE MRTK_PATCHES_ALREADY_APPLIED
    OUTPUT_QUIET ERROR_QUIET
)
if(NOT MRTK_PATCHES_ALREADY_APPLIED EQUAL 0)
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" apply --check ${MRTKLIB_ANDROID_PATCHES}
        WORKING_DIRECTORY "${mrtklib_src_SOURCE_DIR}"
        RESULT_VARIABLE MRTK_PATCHES_CHECK
        OUTPUT_QUIET ERROR_VARIABLE MRTK_PATCHES_ERROR
    )
    if(NOT MRTK_PATCHES_CHECK EQUAL 0)
        message(FATAL_ERROR "MRTKLIB Android patches no longer apply: ${MRTK_PATCHES_ERROR}")
    endif()
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" apply ${MRTKLIB_ANDROID_PATCHES}
        WORKING_DIRECTORY "${mrtklib_src_SOURCE_DIR}"
        RESULT_VARIABLE MRTK_PATCHES_RESULT
    )
    if(NOT MRTK_PATCHES_RESULT EQUAL 0)
        message(FATAL_ERROR "Failed to apply MRTKLIB Android patches")
    endif()
endif()

# MRTKLIB's upstream top-level CMake assumes it is the root project when it
# generates version files. Android embeds it, so reproduce only the modular
# library target here and keep the exact source manifest from the pinned commit.
set(MRTKLIB_VERSION_MAJOR 0)
set(MRTKLIB_VERSION_MINOR 7)
set(MRTKLIB_VERSION_PATCH 8)
set(MRTKLIB_VERSION_STRING "0.7.8")
set(MRTKLIB_ANDROID_INCLUDE "${CMAKE_CURRENT_BINARY_DIR}/mrtklib_include")
file(MAKE_DIRECTORY "${MRTKLIB_ANDROID_INCLUDE}/mrtklib")
configure_file(
    "${mrtklib_src_SOURCE_DIR}/include/mrtklib/mrtk_version.h.in"
    "${MRTKLIB_ANDROID_INCLUDE}/mrtklib/mrtk_version.h"
    @ONLY
)

set(MRTK_GIT_VERSION_C "${CMAKE_CURRENT_BINARY_DIR}/mrtk_git_version.c")
file(WRITE "${MRTK_GIT_VERSION_C}"
    "/* Android embedded MRTKLIB build. */\nconst char mrtklib_git_hash_str[] = \"d0f56fe6a676\";\n")

set(MRTKLIB_ANDROID_SOURCES
    # core
    "${mrtklib_src_SOURCE_DIR}/src/core/tomlc99/toml.c"
    "${mrtklib_src_SOURCE_DIR}/src/core/mrtk_toml.c"
    "${mrtklib_src_SOURCE_DIR}/src/core/mrtk_context.c"
    "${mrtklib_src_SOURCE_DIR}/src/core/mrtk_core.c"
    "${mrtklib_src_SOURCE_DIR}/src/core/mrtk_time.c"
    "${mrtklib_src_SOURCE_DIR}/src/core/mrtk_mat.c"
    "${mrtklib_src_SOURCE_DIR}/src/core/mrtk_coords.c"
    "${mrtklib_src_SOURCE_DIR}/src/core/mrtk_bits.c"
    "${mrtklib_src_SOURCE_DIR}/src/core/mrtk_sys.c"
    "${mrtklib_src_SOURCE_DIR}/src/core/mrtk_trace.c"
    "${mrtklib_src_SOURCE_DIR}/src/core/mrtk_cli.c"

    # physical/environment models
    "${mrtklib_src_SOURCE_DIR}/src/models/mrtk_atmos.c"
    "${mrtklib_src_SOURCE_DIR}/src/models/mrtk_astro.c"
    "${mrtklib_src_SOURCE_DIR}/src/models/mrtk_antenna.c"
    "${mrtklib_src_SOURCE_DIR}/src/models/mrtk_geoid.c"
    "${mrtklib_src_SOURCE_DIR}/src/models/mrtk_tides.c"
    "${mrtklib_src_SOURCE_DIR}/src/models/mrtk_station.c"

    # navigation/observation data
    "${mrtklib_src_SOURCE_DIR}/src/data/mrtk_eph.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/mrtk_peph.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/mrtk_obs.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/mrtk_nav.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/mrtk_rinex.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/mrtk_convrnx.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/mrtk_ionex.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/mrtk_bias_sinex.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/mrtk_fcb.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/mrtk_sbas.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/mrtk_rcvraw.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/rcv/mrtk_rcv_binex.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/rcv/mrtk_rcv_crescent.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/rcv/mrtk_rcv_javad.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/rcv/mrtk_rcv_novatel.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/rcv/mrtk_rcv_nvs.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/rcv/mrtk_rcv_rt17.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/rcv/mrtk_rcv_septentrio.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/rcv/mrtk_rcv_skytraq.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/rcv/mrtk_rcv_ss2.c"
    "${mrtklib_src_SOURCE_DIR}/src/data/rcv/mrtk_rcv_ublox.c"

    # RTCM / SSR
    "${mrtklib_src_SOURCE_DIR}/src/rtcm/mrtk_rtcm.c"
    "${mrtklib_src_SOURCE_DIR}/src/rtcm/mrtk_rtcm2.c"
    "${mrtklib_src_SOURCE_DIR}/src/rtcm/mrtk_rtcm3.c"
    "${mrtklib_src_SOURCE_DIR}/src/rtcm/mrtk_rtcm3e.c"
    "${mrtklib_src_SOURCE_DIR}/src/rtcm/mrtk_rtcm3_local_corr.c"

    # correction services used by modular PPP paths
    "${mrtklib_src_SOURCE_DIR}/src/madoca/mrtk_madoca.c"
    "${mrtklib_src_SOURCE_DIR}/src/madoca/mrtk_madoca_iono.c"
    "${mrtklib_src_SOURCE_DIR}/src/madoca/mrtk_madoca_local_corr.c"
    "${mrtklib_src_SOURCE_DIR}/src/madoca/mrtk_madoca_local_comb.c"
    "${mrtklib_src_SOURCE_DIR}/src/has/mrtk_has.c"
    "${mrtklib_src_SOURCE_DIR}/src/has/mrtk_has_rs.c"
    "${mrtklib_src_SOURCE_DIR}/src/clas/mrtk_clas.c"
    "${mrtklib_src_SOURCE_DIR}/src/clas/mrtk_clas_grid.c"
    "${mrtklib_src_SOURCE_DIR}/src/clas/mrtk_clas_osr.c"
    "${mrtklib_src_SOURCE_DIR}/src/clas/mrtk_clas_isb.c"

    # positioning
    "${mrtklib_src_SOURCE_DIR}/src/pos/mrtk_spp.c"
    "${mrtklib_src_SOURCE_DIR}/src/pos/mrtk_rtkpos.c"
    "${mrtklib_src_SOURCE_DIR}/src/pos/mrtk_ppp_ar.c"
    "${mrtklib_src_SOURCE_DIR}/src/pos/mrtk_ppp.c"
    "${mrtklib_src_SOURCE_DIR}/src/pos/mrtk_ppp_rtk.c"
    "${mrtklib_src_SOURCE_DIR}/src/pos/mrtk_vrs.c"
    "${mrtklib_src_SOURCE_DIR}/src/pos/mrtk_ppp_iono.c"
    "${mrtklib_src_SOURCE_DIR}/src/pos/mrtk_lambda.c"
    "${mrtklib_src_SOURCE_DIR}/src/pos/mrtk_postpos.c"
    "${mrtklib_src_SOURCE_DIR}/src/pos/mrtk_sol.c"
    "${mrtklib_src_SOURCE_DIR}/src/pos/mrtk_opt.c"
    "${mrtklib_src_SOURCE_DIR}/src/pos/mrtk_options.c"

    # real-time support referenced by the modular library
    "${mrtklib_src_SOURCE_DIR}/src/stream/mrtk_stream.c"
    "${mrtklib_src_SOURCE_DIR}/src/stream/mrtk_rtksvr.c"
    "${mrtklib_src_SOURCE_DIR}/src/stream/mrtk_streamsvr.c"
)

add_library(mrtklib_android STATIC
    ${MRTKLIB_ANDROID_SOURCES}
    ${MRTK_GIT_VERSION_C}
)
set_target_properties(mrtklib_android PROPERTIES
    C_STANDARD 11
    C_STANDARD_REQUIRED ON
    POSITION_INDEPENDENT_CODE ON
)
target_include_directories(mrtklib_android PUBLIC
    "${mrtklib_src_SOURCE_DIR}/include"
    "${MRTKLIB_ANDROID_INCLUDE}"
)
target_compile_definitions(mrtklib_android PUBLIC
    _GNU_SOURCE
    ENAGLO ENAGAL ENAQZS ENACMP ENAIRN
    NFREQ=5 NEXOBS=5 TRACE
)
# Android/Bionic supplies pthread/time functionality through libc; unlike the
# desktop Linux build it should not link a separate librt.
target_link_libraries(mrtklib_android PUBLIC m)

add_library(precision_location SHARED
    native_bridge.c
    android_nav.c
)
find_library(log_lib log)
target_link_libraries(precision_location PRIVATE mrtklib_android ${log_lib} m)
target_include_directories(precision_location PRIVATE
    "${mrtklib_src_SOURCE_DIR}/include"
    "${MRTKLIB_ANDROID_INCLUDE}"
)
