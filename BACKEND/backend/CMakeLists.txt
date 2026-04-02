# ================================================================
# CMakeLists.txt - MEGA FLOWZ C++ Engine
# ================================================================

cmake_minimum_required(VERSION 3.20)
project(mega_engine VERSION 1.0.0 LANGUAGES CXX C)

# ── C++ Standard ──
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── Find Python ──
find_package(Python3 REQUIRED COMPONENTS Interpreter Development)

# ── Find pybind11 ──
execute_process(
    COMMAND ${Python3_EXECUTABLE} -c "import pybind11; print(pybind11.get_cmake_dir())"
    OUTPUT_VARIABLE pybind11_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
)
find_package(pybind11 CONFIG REQUIRED HINTS ${pybind11_DIR})

# ── uSockets with libuv backend ──
set(USOCKETS_SOURCES
    libs/uSockets/src/bsd.c
    libs/uSockets/src/context.c
    libs/uSockets/src/loop.c
    libs/uSockets/src/socket.c
    libs/uSockets/src/udp.c
    libs/uSockets/src/eventing/libuv.c
)

# ── Filter only existing files ──
set(USOCKETS_FILTERED)
foreach(f ${USOCKETS_SOURCES})
    if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/${f}")
        list(APPEND USOCKETS_FILTERED ${f})
    endif()
endforeach()

# ── uSockets static library ──
add_library(usockets STATIC ${USOCKETS_FILTERED})
target_include_directories(usockets PUBLIC
    libs/uSockets/src
    C:/msys64/mingw64/include
)
target_compile_definitions(usockets PUBLIC
    LIBUS_NO_SSL=1
    LIBUS_USE_LIBUV=1
)

# ── Include directories ──
include_directories(include)
include_directories(libs)
include_directories(libs/uWebSockets/src)
include_directories(libs/uSockets/src)
include_directories(C:/msys64/mingw64/include)
include_directories(${Python3_INCLUDE_DIRS})

# ── Main executable ──
set(SOURCES
    src/main.cpp
)

add_executable(mega_engine ${SOURCES})

# ── Link libraries ──
target_link_libraries(mega_engine
    usockets
    pybind11::embed
    ${Python3_LIBRARIES}
    C:/msys64/mingw64/lib/libuv.dll.a
    ws2_32
    z
)

# ── Compiler definitions ──
target_compile_definitions(mega_engine PRIVATE
    LIBUS_NO_SSL=1
    LIBUS_USE_LIBUV=1
)

# ── Compiler flags ──
if(MSVC)
    target_compile_options(mega_engine PRIVATE /W4 /O2)
else()
    target_compile_options(mega_engine PRIVATE -Wall -O2)
endif()

message(STATUS "MEGA FLOWZ Engine configured")
message(STATUS "Python: ${Python3_VERSION}")
message(STATUS "Compiler: ${CMAKE_CXX_COMPILER_ID}")