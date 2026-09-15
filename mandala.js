/* ============================================================================
   mandala.js — Motor WebGL Vanilla JS para Tela Inicial
   ============================================================================ */

const CURSOR_FOLLOW = 3.0;
const MAX_BANDS = 8;
const MOTIF_KINDS = 6.0;
const CELL_FILL = 0.9;

const MANDALA_DEFAULTS = {
    line: "#F2E4CF",
    warm: "#59001C",
    cool: "#6900BA",
    bands: 8,
    symmetry: 16,
    variety: 19,
    point: 6,
    fill: 20,
    weight: 1,
    rules: 0,
    spin: 10,
    scale: 180
};

function clamp(v, lo, hi, fallback) {
    const n = typeof v === "number" && isFinite(v) ? v : fallback;
    return Math.max(lo, Math.min(hi, n));
}

function toOklab(hex, fallback) {
    const c = new THREE.Color(hex || fallback);
    const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b);
    const m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b);
    const s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
    return new THREE.Vector3(
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    );
}

function settingsFor(cfg) {
    return {
        bands: Math.round(clamp(cfg.bands, 1, MAX_BANDS, MANDALA_DEFAULTS.bands)),
        symmetry: Math.round(clamp(cfg.symmetry, 3, 16, MANDALA_DEFAULTS.symmetry)),
        variety: clamp(cfg.variety, 0, 20, MANDALA_DEFAULTS.variety) / 20,
        point: 0.5 + clamp(cfg.point, 1, 20, MANDALA_DEFAULTS.point) * 0.11,
        fill: clamp(cfg.fill, 0, 20, MANDALA_DEFAULTS.fill) / 20,
        weight: Math.max(1.0, 0.6 + clamp(cfg.weight, 1, 20, MANDALA_DEFAULTS.weight) * 0.26),
        rules: clamp(cfg.rules, 0, 20, MANDALA_DEFAULTS.rules) * 0.09,
        spin: clamp(cfg.spin, 0, 20, MANDALA_DEFAULTS.spin) * 0.012,
        scale: clamp(cfg.scale, 20, 200, MANDALA_DEFAULTS.scale) / 100,
    };
}

const QUAD_VERTEX = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;

const MANDALA_FRAGMENT = `
    precision highp float;
    #define MAX_BANDS ${MAX_BANDS}
    #define KINDS ${MOTIF_KINDS.toFixed(1)}
    #define CELL_FILL ${CELL_FILL}
    #define TAU 6.28318530718
    #define PI 3.14159265359

    uniform vec2 uResolution;
    uniform vec2 uPointer;
    uniform float uHold;
    uniform float uTurn;
    uniform vec3 uLine;
    uniform vec3 uWarm;
    uniform vec3 uCool;
    uniform float uBands;
    uniform float uSymmetry;
    uniform float uVariety;
    uniform float uPoint;
    uniform float uFill;
    uniform float uWeight;
    uniform float uRules;
    uniform float uScale;

    varying vec2 vUv;

    vec3 rgbFromOklab(vec3 lab) {
        float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
        float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
        float s = lab.x - 0.0894841775 * lab.y - 1.291485548 * lab.z;
        l = l * l * l;
        m = m * m * m;
        s = s * s * s;
        return vec3(
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
        );
    }

    float hash1(float n) {
        return fract(sin(n * 127.1 + 0.371) * 43758.5453123);
    }

    float motifDist(float kind, vec2 q, float inner, float outer, float sector) {
        float span = max(outer - inner, 0.0001);
        float t = clamp((q.x - inner) / span, 0.0, 1.0);
        float room = q.x * sin(sector * 0.5) * CELL_FILL;
        float mid = (inner + outer) * 0.5;
        float wide = mid * sin(sector * 0.5) * CELL_FILL;
        float fits = min(span * 0.5, wide);

        float d;
        if (kind < 1.0) {
            float taper = wide * pow(max(cos(PI * 0.5 * t), 0.0), uPoint);
            d = abs(q.y) - min(room, taper);
        } else if (kind < 2.0) {
            d = length(q - vec2(mid, 0.0)) - fits * 0.8;
        } else if (kind < 3.0) {
            float r = fits * 0.82;
            d = abs(length(q - vec2(mid, 0.0)) - r) - r * 0.34;
        } else if (kind < 4.0) {
            d = abs(q.y) - room * (1.0 - t);
        } else if (kind < 5.0) {
            float r = span * 0.85;
            d = abs(length(q - vec2(outer, 0.0)) - r) - span * 0.13;
            d = max(d, abs(q.y) - room);
        } else {
            vec2 c = q - vec2(mid, 0.0);
            float w = min(span, wide * 2.0) * 0.11;
            float bar = min(
                abs(dot(c, vec2(0.70710678, 0.70710678))) - w,
                abs(dot(c, vec2(0.70710678, -0.70710678))) - w
            );
            d = max(bar, abs(q.y) - room);
        }
        d = max(d, q.x - outer);
        return max(d, inner - q.x);
    }

    void main() {
        float unit = min(uResolution.x, uResolution.y);
        vec2 p = (vUv * uResolution - uResolution * 0.5) / (unit * uScale);

        float radius = length(p);
        float angle = atan(p.y, p.x) + uTurn;

        float span = 0.5;
        float bandWidth = span / uBands;
        if (radius > span) discard;

        vec3 lineCol = rgbFromOklab(uLine);
        vec3 col = vec3(0.0);
        float cover = 0.0;

        for (int i = 0; i < MAX_BANDS; i++) {
            float fi = float(i);
            if (fi < uBands) {
                float inner = fi * bandWidth;
                float outer = inner + bandWidth;
                if (radius < inner || radius > outer) continue;

                float reps = uSymmetry * pow(2.0, floor(fi * 0.5));
                float sector = TAU / reps;
                float a = mod(angle + sector * 0.5, sector) - sector * 0.5;
                vec2 q = vec2(cos(a), sin(a)) * radius;

                float kind = floor(hash1(fi * 5.7 + 2.1) * KINDS * uVariety);
                float d = motifDist(kind, q, inner, outer, sector);
                float aa = max(fwidth(d), 0.0001);
                float w = uWeight / (unit * uScale);

                float solid = 1.0 - smoothstep(-aa, aa, d);
                float stroke = 1.0 - smoothstep(w - aa, w + aa, abs(d));

                vec3 body = mod(fi, 2.0) < 0.5
                    ? rgbFromOklab(uWarm)
                    : rgbFromOklab(uCool);

                col = mix(col, body, solid * uFill);
                col = mix(col, lineCol, stroke);
                cover = max(cover, max(solid * uFill, stroke));
            }
        }

        if (uRules > 0.0) {
            float steps = radius / bandWidth;
            float toRule = min(fract(steps), 1.0 - fract(steps)) * bandWidth;
            float rule = min(toRule, abs(radius - span));
            float aaR = max(fwidth(radius), 0.0001);
            float wR = (uWeight * uRules) / (unit * uScale);
            float ink = 1.0 - smoothstep(wR - aaR, wR + aaR, rule);
            col = mix(col, lineCol, ink);
            cover = max(cover, ink);
        }

        if (cover < 0.004) discard;
        gl_FragColor = vec4(col * cover, cover);
    }
`;

class MandalaScene {
    constructor(container, cfg = MANDALA_DEFAULTS) {
        this.container = container;
        this.cfg = cfg;
        const S = settingsFor(cfg);

        this.scene = new THREE.Scene();
        this.camera = new THREE.Camera();
        this.geometry = new THREE.PlaneGeometry(2, 2);

        this.target = new THREE.Vector2(0, 0);
        this.eased = new THREE.Vector2(0, 0);
        this.hold = 0;
        this.wantHold = 0;
        this.turn = 0;
        this.frameId = 0;
        this.running = false;

        this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x000000, 0);

        const el = this.renderer.domElement;
        el.style.position = "absolute";
        el.style.inset = "0";
        el.style.width = "100%";
        el.style.height = "100%";
        this.container.appendChild(el);

        this.material = new THREE.ShaderMaterial({
            vertexShader: QUAD_VERTEX,
            fragmentShader: MANDALA_FRAGMENT,
            uniforms: {
                uResolution: { value: new THREE.Vector2(1, 1) },
                uPointer: { value: new THREE.Vector2(0, 0) },
                uHold: { value: 0 },
                uTurn: { value: 0 },
                uLine: { value: toOklab(cfg.line, MANDALA_DEFAULTS.line) },
                uWarm: { value: toOklab(cfg.warm, MANDALA_DEFAULTS.warm) },
                uCool: { value: toOklab(cfg.cool, MANDALA_DEFAULTS.cool) },
                uBands: { value: S.bands },
                uSymmetry: { value: S.symmetry },
                uVariety: { value: S.variety },
                uPoint: { value: S.point },
                uFill: { value: S.fill },
                uWeight: { value: S.weight },
                uRules: { value: S.rules },
                uScale: { value: S.scale },
            },
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);

        el.addEventListener("pointermove", this.onPointerMove.bind(this));
        el.addEventListener("pointerdown", this.onPointerMove.bind(this));
        el.addEventListener("pointerleave", () => { this.wantHold = 0; });
    }

    onPointerMove(e) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const x = ((e.clientX - rect.left) / rect.width) * this.width;
        const y = (1 - (e.clientY - rect.top) / rect.height) * this.height;
        this.target.set(x, y);
        if (this.wantHold === 0) this.eased.copy(this.target);
        this.wantHold = 1;
    }

    setSize(width, height) {
        if (width <= 0 || height <= 0) return;
        this.renderer.setSize(width, height, false);
        const dpr = this.renderer.getPixelRatio();
        this.width = width * dpr;
        this.height = height * dpr;
        this.material.uniforms.uResolution.value.set(this.width, this.height);
        if (this.wantHold === 0) {
            this.target.set(this.width * 0.5, this.height * 0.5);
            this.eased.copy(this.target);
        }
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastT = performance.now();
        const loop = () => {
            if (!this.running) return;
            this.frameId = requestAnimationFrame(loop);
            this.step();
        };
        loop();
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.frameId);
    }

    step() {
        const now = performance.now();
        let dt = (now - this.lastT) / 1000;
        this.lastT = now;
        if (!isFinite(dt) || dt < 0) dt = 0;
        if (dt > 0.05) dt = 0.05;

        const S = settingsFor(this.cfg);
        this.turn = (this.turn + dt * S.spin) % 1;
        this.eased.lerp(this.target, 1 - Math.exp(-dt * CURSOR_FOLLOW));
        this.hold += (this.wantHold - this.hold) * (1 - Math.exp(-dt * 2.5));

        const u = this.material.uniforms;
        u.uTurn.value = this.turn * Math.PI * 2;
        u.uPointer.value.copy(this.eased);
        u.uHold.value = this.hold;
        u.uWeight.value = S.weight * this.renderer.getPixelRatio();

        this.renderer.render(this.scene, this.camera);
    }
}
