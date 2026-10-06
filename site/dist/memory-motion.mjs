// Decorative motion of the existing artwork. This never reads wallet/runtime data.
const image = document.querySelector('.memory-art');
const hero = document.querySelector('.living-hero');
const toggle = document.querySelector('.memory-toggle');
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
    gl.uniform1f(timeUniform, elapsed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
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
        void main(){
          vec2 p=(uv-.5)/fit+.5;
          vec3 background=vec3(18.,13.,19.)/255.;
          if(p.x<0.||p.x>1.||p.y<0.||p.y>1.){gl_FragColor=vec4(background,1.);return;}
          float side=smoothstep(.02,.24,abs(p.x-.5));
          float edge=smoothstep(0.,.06,p.x)*smoothstep(0.,.06,1.-p.x)
            *smoothstep(0.,.08,p.y)*smoothstep(0.,.08,1.-p.y);
          // Local flow, anchored at the connecting node. No whole-page zoom.
          vec2 drift=vec2(sin(p.y*10.+time*.55)+.45*sin(p.x*19.-time*.37),
            sin(p.x*13.-time*.48)+.35*cos(p.y*16.+time*.31));
          p+=drift*vec2(.0038,.009)*side*edge;
          vec3 base=texture2D(artwork,p).rgb;
          float detail=smoothstep(.12,.55,max(base.r,max(base.g,base.b)));
          float tissue=.055*sin(time*.8+p.x*12.-p.y*7.);
          // A slow wave highlights existing filaments, rather than drawing fake paths.
          float travel=fract(time/6.5)*1.24-.12;
          float sweep=exp(-pow((p.x-travel)/.055,2.));
          float trunk=.48+.045*sin((p.x-.5)*5.);
          float channel=exp(-pow((p.y-trunk)/.19,2.));
          vec2 center=(p-vec2(.502,.492))*vec2(2.566,1.);
          float heartbeat=.5+.5*sin(time*1.4);
          float node=exp(-dot(center,center)/.0009)*(.08+.11*heartbeat);
          float shimmer=.07*sin(time*1.05+p.x*43.+p.y*24.);
          vec3 light=vec3(1.,.48,.35)*detail*(sweep*(.16+.48*channel)+tissue+shimmer*.35);
          gl_FragColor=vec4(base+light+vec3(1.,.62,.45)*node,1.);
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
