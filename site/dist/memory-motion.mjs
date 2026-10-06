// A visible eight-second transfer in the original artwork, not live telemetry.
const image = document.querySelector('.memory-art');
const hero = document.querySelector('.living-hero');
const toggle = document.querySelector('.memory-toggle');
const replay = document.querySelector('.memory-replay');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

if (image && hero && toggle) {
  const canvas = document.createElement('canvas');
  canvas.className = 'memory-art memory-motion';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = 2009;
  canvas.height = 783;
  const gl = canvas.getContext('webgl', {alpha: false, antialias: false, depth: false,
    stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power'});
  let frame = 0, elapsed = 0, last = 0, visible = false, paused = false, ready = false;
  let failed = false, program, timeUniform, fitUniform;

  function staticFallback() {
    failed = true;
    ready = false;
    cancelAnimationFrame(frame);
    frame = 0;
    hero.classList.remove('memory-animated');
    canvas.remove();
    toggle.hidden = true;
    if (replay) replay.hidden = true;
    hero.dataset.motion = 'static';
  }

  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      gl.deleteShader(result);
      throw new Error('Motion shader unavailable');
    }
    return result;
  }

  function draw() {
    // Keep mobile mediump shader clocks precise even in a long-open tab.
    gl.uniform1f(timeUniform, elapsed % 8);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const beat = elapsed % 8;
    hero.dataset.motionPhase = beat < 1.15 ? 'gather' : beat < 3.15 ? 'transfer'
      : beat < 6.8 ? 'recover' : 'rest';
  }

  function resize() {
    if (!ready) return;
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const density = Math.min(devicePixelRatio || 1, innerWidth < 701 ? 1.25 : 1.5);
    const scale = Math.min(density, 1800 / rect.width);
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    const contentAspect = image.naturalWidth / image.naturalHeight;
    const boxAspect = rect.width / rect.height;
    // Match the image's object-fit:contain including its max-height letterbox.
    gl.uniform2f(fitUniform, Math.min(1, contentAspect / boxAspect),
      Math.min(1, boxAspect / contentAspect));
    draw();
  }

  function running() {
    return ready && !failed && !paused && !reduced.matches && visible && !document.hidden;
  }

  function tick(now) {
    frame = 0;
    if (!running()) return;
    if (!last) last = now;
    // 30fps desktop / 24fps small screens. No catch-up after hidden/offscreen time.
    const interval = innerWidth < 701 ? 1000 / 24 : 1000 / 30;
    if (now - last >= interval) {
      elapsed += Math.min((now - last) / 1000, .1);
      last = now;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    const staticPreference = reduced.matches;
    hero.classList.toggle('memory-animated', ready && !failed && !staticPreference);
    toggle.hidden = !ready || failed || staticPreference;
    if (replay) replay.hidden = toggle.hidden;
    toggle.textContent = paused ? 'Resume motion' : 'Pause motion';
    toggle.setAttribute('aria-label', paused ? 'Resume decorative animation' : 'Pause decorative animation');
    toggle.setAttribute('aria-pressed', String(paused));
    hero.dataset.motion = staticPreference || failed ? 'static' : running() ? 'running' : 'paused';
    if (running()) {
      if (!frame) {last = 0; frame = requestAnimationFrame(tick);}
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    }
  }

  async function initialize() {
    if (!gl) {staticFallback(); return;}
    try {
      await image.decode();
      const vertex = shader(gl.VERTEX_SHADER, `
        attribute vec2 position;
        varying vec2 uv;
        void main(){uv=vec2(position.x*.5+.5,.5-position.y*.5);gl_Position=vec4(position,0.,1.);}
      `);
      const fragment = shader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        varying vec2 uv;
        uniform sampler2D artwork;
        uniform float time;
        uniform vec2 fit;
        float bell(float t,float a,float b){
          float v=clamp((t-a)/(b-a),0.,1.);
          return pow(sin(v*3.14159265),2.);
        }
        void main(){
          vec2 p=(uv-.5)/fit+.5;
          vec3 background=vec3(18.,13.,19.)/255.;
          if(p.x<0.||p.x>1.||p.y<0.||p.y>1.){gl_FragColor=vec4(background,1.);return;}
          float beat=mod(time,8.);
          float gather=bell(beat,0.,2.7);
          float recover=smoothstep(2.6,3.7,beat)-smoothstep(5.3,6.8,beat);
          float pass=bell(beat,1.1,3.2);
          vec2 anchor=vec2(.502,.492);
          float left=1.-smoothstep(.46,.50,p.x);
          float right=smoothstep(.51,.56,p.x);
          float edge=smoothstep(0.,.06,p.x)*smoothstep(0.,.06,1.-p.x)
            *smoothstep(0.,.08,p.y)*smoothstep(0.,.08,1.-p.y);
          // Coherent strain: lobes pull against the fixed connection, then release.
          // No noise field, independent wobble or movement of the camera/background.
          vec2 relative=p-anchor;
          p+=relative*vec2(.105,-.040)*gather*left*edge;
          p-=relative*vec2(.085,.105)*recover*right*edge;
          // A small coherent twist opens the receiving membrane. It does not
          // independently shake individual pixels or move the joining anchor.
          p+=vec2(-relative.y*.018,relative.x*.055)*recover*right*edge;
          vec3 base=texture2D(artwork,p).rgb;
          // Gate light to warm filaments already present in the source. The packet
          // follows only the connecting stem, never a vertical band of the image.
          float detail=smoothstep(.18,.65,max(base.r,max(base.g,base.b)));
          float warm=smoothstep(.025,.16,base.r-base.b);
          float travel=mix(.20,.83,smoothstep(1.1,3.2,beat));
          float stem=.492+.085*sin((p.x-.502)*3.1);
          float packet=exp(-pow((p.x-travel)/.052,2.))
            *exp(-pow((p.y-stem)/.048,2.))*pass;
          vec2 center=(p-anchor)*vec2(2.566,1.);
          float handoff=bell(beat,1.75,2.6);
          float node=exp(-dot(center,center)/.0012)*handoff;
          float radius=length((p-anchor)*vec2(1.,.39));
          float front=mix(.025,.44,smoothstep(2.35,4.5,beat));
          float spread=exp(-pow((radius-front)/.048,2.))*bell(beat,2.35,5.);
          // Dark → alive is legible even on a phone. Brighten only original
          // filaments, then reveal a branching front inside the receiving lobe.
          base*=1.+detail*(left*gather*.17+right*(-.40+recover*.73));
          vec3 light=vec3(1.,.42,.27)*detail
            *(warm*packet*.95+right*spread*.23);
          gl_FragColor=vec4(base+light+vec3(1.,.62,.45)*node*.32,1.);
        }
      `);
      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Motion program unavailable');
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      timeUniform = gl.getUniformLocation(program, 'time');
      fitUniform = gl.getUniformLocation(program, 'fit');
      hero.insertBefore(canvas, image.nextSibling);
      ready = true;
      resize();
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Motion texture unavailable');
      const observer = new IntersectionObserver(entries => {visible = entries[0].isIntersecting; sync();}, {threshold:0});
      observer.observe(hero);
      new ResizeObserver(resize).observe(image);
      toggle.addEventListener('click', () => {paused = !paused; sync();});
      replay?.addEventListener('click', () => {
        elapsed = 0; last = 0; paused = false;
        draw(); sync();
      });
      reduced.addEventListener('change', sync);
      document.addEventListener('visibilitychange', sync);
      canvas.addEventListener('webglcontextlost', event => {event.preventDefault(); staticFallback();});
      sync();
    } catch {
      staticFallback();
    }
  }
  initialize();
}
