import Modal from "react-modal";

import { WorldMap, WorldMapProps } from "./WorldMap";
import "./WorldMapModal.css";

interface WorldMapModalProps {
    isOpen: boolean;

    onRequestClose: () => void;
}

type Props = WorldMapModalProps & WorldMapProps;

if (typeof document !== "undefined") {
    Modal.setAppElement(document.getElementById("root") ?? document.body);
}

export function WorldMapModal(props: Props) {
    const { isOpen, onRequestClose } = props;
    return (
        <Modal
            className="worldmap-modal rs-border"
            overlayClassName="worldmap-modal-overlay"
            isOpen={isOpen}
            onRequestClose={onRequestClose}
        >
            <div className="worldmap-close-button" onClick={onRequestClose}></div>
            <WorldMap {...props} />
        </Modal>
    );
}
