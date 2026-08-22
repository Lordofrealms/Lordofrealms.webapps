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

# EXCLUDE_FROM_ALL prevents MRTKLIB command-line apps from being built for Android.
add_subdirectory(${mrtklib_src_SOURCE_DIR} ${mrtklib_src_BINARY_DIR} EXCLUDE_FROM_ALL)

add_library(precision_location SHARED native_bridge.c)
find_library(log_lib log)
target_link_libraries(precision_location PRIVATE mrtklib ${log_lib} m)
target_include_directories(precision_location PRIVATE
    ${mrtklib_src_SOURCE_DIR}/include
    ${mrtklib_src_BINARY_DIR}/include
)
