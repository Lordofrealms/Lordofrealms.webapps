cmake_minimum_required(VERSION 3.22.1)
project(precision_location C)

include(FetchContent)

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

# MRTKLIB's upstream top-level CMake currently assumes it is the root project
# (CMAKE_SOURCE_DIR/CMAKE_BINARY_DIR). Android embeds it, so build the modular
# library directly instead of invoking that desktop-oriented root project.
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

# The upstream src/ tree is the modular C11 library; apps/tests live elsewhere.
# Keeping this broad means a future phone can use SF/DF/MF PPP, HAS, or RTK
# without maintaining a second hand-copied source manifest.
file(GLOB_RECURSE MRTKLIB_ANDROID_SOURCES CONFIGURE_DEPENDS
    "${mrtklib_src_SOURCE_DIR}/src/*.c"
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
    android_observation.c
)
find_library(log_lib log)
target_link_libraries(precision_location PRIVATE mrtklib_android ${log_lib} m)
target_include_directories(precision_location PRIVATE
    "${mrtklib_src_SOURCE_DIR}/include"
    "${MRTKLIB_ANDROID_INCLUDE}"
)
