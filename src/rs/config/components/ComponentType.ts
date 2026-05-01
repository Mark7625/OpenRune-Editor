export interface ComponentType {
    v3: boolean;
    type: number;
    buttonType: number;
    clientCode: number;
    x: number;
    y: number;
    width: number;
    height: number;

    trans1: number;
    layer: number;
    mouseOverRedirect: number;

    cs1Comparisons?: number[];
    cs1ComparisonValues?: number[];
    cs1Instructions?: number[][];

    scrollHeight: number;
    hide: boolean;
    fill: boolean;

    textAlignH: number;
    textAlignV: number;
    textLineHeight: number;
    textFont: number;
    textShadow: boolean;

    secondaryText: string;

    colour1: number;
    colour2: number;
    mouseOverColour1: number;
    mouseOverColour2: number;

    graphic: number;
    secondaryGraphic: number;

    modelKind: number;
    model: number;
    secondaryModelKind: number;
    secondaryModel: number;

    modelAnim: number;
    secondaryModelAnim: number;

    modelZoom: number;
    modelAngleX: number;
    modelAngleY: number;
    modelAngleZ: number;

    text: string;
    targetVerb: string;
    targetBase: string;

    events: number;
    buttonText: string;

    widthMode: number;
    heightMode: number;
    xMode: number;
    yMode: number;

    scrollWidth: number;
    noClickThrough: boolean;

    angle2d: number;
    tiling: boolean;

    outline: number;
    graphicShadow: number;

    vFlip: boolean;
    hFlip: boolean;

    modelX: number;
    modelY: number;
    modelOrthog: boolean;
    modelObjWidth: number;

    lineWid: number;
    lineDirection: boolean;

    opBase: string;
    op: string[];

    dragDeadZone: number;
    dragDeadTime: number;
    draggableBehavior: boolean;

    onLoad?: any[];
    onMouseOver?: any[];
    onMouseLeave?: any[];
    onTargetLeave?: any[];
    onTargetEnter?: any[];
    onVarTransmit?: any[];
    onInvTransmit?: any[];
    onStatTransmit?: any[];
    onTimer?: any[];
    onOp?: any[];
    onMouseRepeat?: any[];
    onClick?: any[];
    onClickRepeat?: any[];
    onRelease?: any[];
    onHold?: any[];
    onDrag?: any[];
    onDragComplete?: any[];
    onScrollWheel?: any[];

    onVarTransmitList?: number[];
    onInvTransmitList?: number[];
    onStatTransmitList?: number[];
    internalId: number;
    id: number;

    tempWidth: number;
    tempHeight: number;
    x1?: number;
    y1?: number;
    field3770?: number;
    field3677?: number;
}
