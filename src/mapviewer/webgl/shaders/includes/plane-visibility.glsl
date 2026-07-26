const int PLANE_SCENE_BORDER_SIZE = 6;
const int PLANE_TILE_SIZE_SHIFT = 7;

uniform highp usampler2DArray u_tileRenderFlags;

int getTileRenderFlag(int level, vec2 pos) {
    ivec2 ipos = ivec2(pos);
    int tileX = ipos.x >> PLANE_TILE_SIZE_SHIFT;
    int tileZ = ipos.y >> PLANE_TILE_SIZE_SHIFT;
    return int(texelFetch(u_tileRenderFlags, ivec3(PLANE_SCENE_BORDER_SIZE + tileX, PLANE_SCENE_BORDER_SIZE + tileZ, level), 0).r);
}

int getTileMinLevel(int level, vec2 pos) {
    int flags = getTileRenderFlag(level, pos);
    if ((flags & 0x8) != 0) {
        return 0;
    }
    if (level > 0 && (flags & 0x2) != 0) {
        return level - 1;
    }
    return level;
}

bool isPlayerLevel(int level, vec2 pos, int playerLevel) {
    if ((getTileRenderFlag(0, pos) & 0x2) != 0) {
        return true;
    }
    if ((getTileRenderFlag(level, pos) & 0x10) != 0) {
        return false;
    }
    return playerLevel == getTileMinLevel(level, pos);
}

// OSRS bridge (plane 1) / render-on-lower-Z (plane above) — upper tile draws when viewing the plane below.
bool tileRendersOnPlaneBelow(int upperPlane, vec2 pos) {
    if (upperPlane <= 0 || upperPlane > 3) {
        return false;
    }
    int flags = getTileRenderFlag(upperPlane, pos);
    if ((flags & 0x8) != 0) {
        return true;
    }
    if (upperPlane == 1 && (flags & 0x2) != 0) {
        return true;
    }
    return false;
}

bool isScenePlaneVisible(int plane, vec2 pos, float viewPlaneMax, float hideBelowViewPlane) {
    int maxPlane = int(viewPlaneMax);

    if (hideBelowViewPlane > 0.5) {
        if (plane < maxPlane) {
            // Force ground under bridge when editing an upper plane only.
            if (plane == maxPlane - 1 && tileRendersOnPlaneBelow(maxPlane, pos)) {
                return true;
            }
            return false;
        }
        return isPlayerLevel(plane, pos, maxPlane);
    }

    if (plane <= maxPlane) {
        // Match MapImageRenderer: skip primary draw when render-Z or no-map-draw is set on this plane.
        if ((getTileRenderFlag(plane, pos) & 0x18) != 0) {
            return false;
        }
        return true;
    }
    if (plane == maxPlane + 1 && maxPlane < 3) {
        if (tileRendersOnPlaneBelow(plane, pos)) {
            return true;
        }
        return isPlayerLevel(plane, pos, maxPlane);
    }
    return false;
}
