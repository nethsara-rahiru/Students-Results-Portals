// Original procedural artwork. A single GPU object continuously morphs between
// an orbital ring and a paper frame. SVG remains as the crisp, resilient fallback.
const vertex = `attribute vec2 position; varying vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment = `precision highp float;
varying vec2 uv;
uniform vec2 resolution; uniform float time; uniform float shape; uniform float energy; uniform vec2 pointer;
mat2 turn(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
float ring(vec3 p,float radius,float thickness){return length(vec2(length(p.xy)-radius,p.z))-thickness;}
float box(vec3 p,vec3 b,float r){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r;}
float scene(vec3 p){
  vec3 orbit=p;orbit.xz*=turn(.18*sin(time*.16)+pointer.x*.16);orbit.yz*=turn(.14*cos(time*.13)+pointer.y*.12);
  float circular=ring(orbit,1.04,.075);
  vec3 planar=p;planar.xz*=turn(-.12+pointer.x*.08);
  float outside=box(planar,vec3(1.13,.72,.025),.17);
  float inside=box(planar,vec3(1.055,.645,.16),.155);
  float frame=max(outside,-inside);
  float body=mix(circular,frame,shape);
  vec3 satellite=orbit;satellite.yz*=turn(.67+time*.065);satellite.xz*=turn(.32);
  float outer=ring(satellite,1.23,.017);
  return min(body,outer+shape*.18);
}
vec3 normalAt(vec3 p){vec2 e=vec2(.002,0.);return normalize(vec3(scene(p+e.xyy)-scene(p-e.xyy),scene(p+e.yxy)-scene(p-e.yxy),scene(p+e.yyx)-scene(p-e.yyx)));}
void main(){
  vec2 p=(uv-.5)*vec2(resolution.x/resolution.y,1.)*3.5;
  if(length(p)>1.65){gl_FragColor=vec4(0.);return;}
  vec3 origin=vec3(0.,0.,4.8),direction=normalize(vec3(p,-4.));
  float distance=0.,nearest=10.;bool hit=false;vec3 point;
  for(int i=0;i<48;i++){
    point=origin+direction*distance;float d=scene(point);nearest=min(nearest,d);
    if(d<.0017){hit=true;break;}distance+=max(d*.86,.001);
    if(distance>7.)break;
  }
  vec3 cyan=vec3(.082,.62,.83),violet=vec3(.616,.349,.922),gold=vec3(.96,.84,.57);
  vec3 tint=mix(cyan,violet,smoothstep(-1.2,1.2,p.x));tint=mix(tint,gold,energy*.55);
  float aura=exp(-max(nearest,0.)*24.)*.17;
  vec3 color=tint*aura;float alpha=aura;
  if(hit){
    vec3 n=normalAt(point),view=-direction,light=normalize(vec3(-2.,3.,4.));
    float diffuse=max(dot(n,light),0.);float fresnel=pow(1.-max(dot(n,view),0.),3.);
    float specular=pow(max(dot(reflect(-light,n),view),0.),90.);
    float rim=pow(max(dot(n,normalize(vec3(3.,-1.,2.))),0.),15.);
    vec3 steel=mix(vec3(.09,.13,.2),tint,.48);
    color=steel*(.25+diffuse*.8)+tint*fresnel*1.25+vec3(.83,.94,1.)*specular*1.4+tint*rim*.5;
    color+=tint*.10*(sin(point.y*110.+point.x*25.)*.5+.5);
    color=color/(color+vec3(.65));alpha=.94;
  }
  gl_FragColor=vec4(color,clamp(alpha,0.,1.));
}`;

export const coreArtwork = `<canvas class="core-canvas" aria-hidden="true"></canvas>
<svg class="core-vector" viewBox="0 0 600 600" preserveAspectRatio="none" aria-hidden="true">
 <defs>
  <linearGradient id="core-spectrum" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#159ED4"/><stop offset=".5" stop-color="#a4e2ff"/><stop offset="1" stop-color="#9D59EB"/></linearGradient>
  <linearGradient id="core-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#83d8ed"/><stop offset=".18" stop-color="#172b43"/><stop offset=".36" stop-color="#9ed6f3"/><stop offset=".45" stop-color="#253750"/><stop offset=".62" stop-color="#a6b3e2"/><stop offset=".78" stop-color="#1e233a"/><stop offset="1" stop-color="#9571ca"/></linearGradient>
  <radialGradient id="core-glass"><stop stop-color="#a9dfff" stop-opacity=".06"/><stop offset=".68" stop-color="#15263d" stop-opacity=".04"/><stop offset="1" stop-color="#159ed4" stop-opacity=".11"/></radialGradient>
 </defs>
 <path class="core-fill" fill="url(#core-glass)"/>
 <path class="core-bevel" fill="none" stroke="url(#core-metal)" stroke-width="4"/>
 <path class="core-outline" fill="none" stroke="url(#core-spectrum)" stroke-width="1.2"/>
 <path class="core-inner" fill="none" stroke="url(#core-spectrum)" stroke-width=".65" stroke-opacity=".48"/>
 <path class="core-trace" fill="none" stroke="url(#core-spectrum)" stroke-width="2" stroke-linecap="round" pathLength="100" stroke-dasharray="7 93"/>
 <g fill="#b4def3" opacity=".6"><circle cx="300" cy="34" r="2"/><circle cx="566" cy="300" r="2"/><circle cx="300" cy="566" r="2"/><circle cx="34" cy="300" r="2"/></g>
</svg>
<svg class="core-satellites" viewBox="0 0 600 600" aria-hidden="true"><g fill="none" stroke="url(#core-spectrum)"><ellipse cx="300" cy="300" rx="280" ry="113" transform="rotate(-28 300 300)" stroke-width="1.2"/><ellipse cx="300" cy="300" rx="265" ry="160" transform="rotate(42 300 300)" stroke-width=".7" opacity=".5"/></g></svg>
<svg class="core-emblem" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="emblem-light" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#159ED4"/><stop offset="1" stop-color="#d3b1ff"/></linearGradient></defs><path d="M60 5 108 32v56L60 115 12 88V32Z" fill="#111d30" fill-opacity=".66" stroke="url(#emblem-light)"/><path d="M35 80 80 35M42 35h38v38" fill="none" stroke="url(#emblem-light)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="m27 30 8-4m50 68 8-4M27 88v-8m66-40v-8" fill="none" stroke="#b9d6eb" stroke-opacity=".45"/></svg>`;

export class JourneyGraphics {
  constructor(core, media) {
    this.core = core;
    this.canvas = core.querySelector("canvas");
    this.paths = [
      ".core-fill",
      ".core-bevel",
      ".core-outline",
      ".core-inner",
      ".core-trace",
    ].map((s) => core.querySelector(s));
    this.media = media;
    this.shape = 0;
    this.energy = 0;
    this.target = { shape: 0, energy: 0 };
    this.pointer = [0, 0];
    this.active = false;
    this.started = false;
    this.failed = false;
    this.frame = 0;
    this.last = 0;
    this.core.dataset.renderer = "svg";
    this.drawVector();
    this.onPreference = () => {
      if (media.matches) this.finish();
      else this.start();
    };
    media.addEventListener("change", this.onPreference);
    this.onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      } else {
        this.draw();
        this.start();
      }
    };
    document.addEventListener("visibilitychange", this.onVisibility);
    core.addEventListener("pointermove", (event) => {
      if (media.matches) return;
      const r = core.getBoundingClientRect();
      this.pointer = [
        (event.clientX - r.left) / r.width - 0.5,
        (event.clientY - r.top) / r.height - 0.5,
      ];
    });
    core.addEventListener("pointerleave", () => {
      this.pointer = [0, 0];
    });
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.failed = true;
      this.gl = null;
      this.core.dataset.renderer = "svg";
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.failed = false;
      this.started = false;
      this.initialise();
      this.draw();
      this.start();
    });
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.draw();
    });
    this.resizeObserver.observe(core);
  }
  initialise() {
    if (this.started || this.failed) return;
    this.started = true;
    try {
      const gl = this.canvas.getContext("webgl", {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
        powerPreference: "low-power",
      });
      if (!gl) throw Error("WebGL unavailable");
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const reason = gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);
          throw Error(reason || "Shader unavailable");
        }
        return shader;
      };
      const vs = compile(gl.VERTEX_SHADER, vertex),
        fs = compile(gl.FRAGMENT_SHADER, fragment),
        program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error("Graphics unavailable");
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.gl = gl;
      this.program = program;
      this.buffer = buffer;
      this.uniforms = Object.fromEntries(
        ["resolution", "time", "shape", "energy", "pointer"].map((name) => [
          name,
          gl.getUniformLocation(program, name),
        ]),
      );
      this.core.dataset.renderer = "webgl";
      this.resize();
    } catch (error) {
      this.core.dataset.fallbackReason = error.message;
      this.failed = true;
      this.core.dataset.renderer = "svg";
      this.gl = null;
    }
  }
  resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2),
      r = { width: this.canvas.offsetWidth, height: this.canvas.offsetHeight };
    const width = Math.min(1280, Math.max(1, Math.round(r.width * ratio))),
      height = Math.min(1280, Math.max(1, Math.round(r.height * ratio)));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl?.viewport(0, 0, width, height);
    }
  }
  morph(shape, energy = 0, duration = 900) {
    this.active = true;
    this.initialise();
    this.from = { shape: this.shape, energy: this.energy };
    this.target = { shape, energy };
    this.began = performance.now();
    this.duration = this.media.matches ? 0 : duration;
    if (this.media.matches) this.finish();
    else this.start();
  }
  finish() {
    this.shape = this.target.shape;
    this.energy = this.target.energy;
    this.began = 0;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.drawVector();
    this.draw();
  }
  drawVector() {
    const path = (inset) => {
      const points = [];
      const power = 2 + this.shape * 7,
        radius = 266 - inset;
      for (let i = 0; i < 96; i++) {
        const angle = (i / 96) * Math.PI * 2,
          c = Math.cos(angle),
          s = Math.sin(angle);
        const x =
            300 + radius * Math.sign(c) * Math.pow(Math.abs(c), 2 / power),
          y = 300 + radius * Math.sign(s) * Math.pow(Math.abs(s), 2 / power);
        points.push((i ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2));
      }
      return points.join(" ") + "Z";
    };
    const outer = path(0),
      inner = path(18);
    this.paths[0].setAttribute("d", outer);
    this.paths[1].setAttribute("d", outer);
    this.paths[2].setAttribute("d", outer);
    this.paths[3].setAttribute("d", inner);
    this.paths[4].setAttribute("d", outer);
  }
  draw(now = performance.now()) {
    if (this.began) {
      const progress = this.duration
        ? Math.min(1, (now - this.began) / this.duration)
        : 1;
      const eased = 1 - Math.pow(1 - progress, 3);
      this.shape =
        this.from.shape + (this.target.shape - this.from.shape) * eased;
      this.energy =
        this.from.energy + (this.target.energy - this.from.energy) * eased;
      if (progress === 1) this.began = 0;
      this.drawVector();
    }
    const gl = this.gl;
    if (!gl) return;
    gl.uniform2f(
      this.uniforms.resolution,
      this.canvas.width,
      this.canvas.height,
    );
    gl.uniform1f(this.uniforms.time, this.media.matches ? 0 : now / 1000);
    gl.uniform1f(this.uniforms.shape, this.shape);
    gl.uniform1f(this.uniforms.energy, this.energy);
    gl.uniform2f(this.uniforms.pointer, ...this.pointer);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  setActive(active) {
    this.active = active;
    if (active) this.start();
    else {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }
  start() {
    if (!this.active || this.frame || this.media.matches || document.hidden)
      return;
    const tick = (now) => {
      if (now - this.last >= 1000 / 30) {
        this.last = now;
        this.draw(now);
      }
      if (!this.gl && !this.began) {
        this.frame = 0;
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.media.removeEventListener("change", this.onPreference);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.gl?.deleteBuffer(this.buffer);
    this.gl?.deleteProgram(this.program);
  }
}
