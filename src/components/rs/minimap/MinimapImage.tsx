interface MinimapImageProps {
    src: string | { src: string };

    left: number;
    top: number;
}

export function MinimapImage({ src, left, top }: MinimapImageProps) {
    const resolvedSrc = typeof src === "string" ? src : src.src;
    return (
        <img
            className="minimap-image"
            src={resolvedSrc}
            alt=""
            width={256}
            height={256}
            style={{ left, top }}
        />
    );
}
