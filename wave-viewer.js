export class WaveViewer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.style.display = "block";
    this.canvas = document.createElement("canvas");
    this.shadowRoot.appendChild(this.canvas);
    this.scrollbar = document.createElement("input");
    this.scrollbar.type = "range";
    this.scrollbar.className = "scrollbar";
    this.scrollbar.min = 0;
    this.scrollbar.max = 1;
    this.scrollbar.step = 0.001;
    this.scrollbar.value = 0;
    this.scrollbar.style.width = "100%";
    this.shadowRoot.appendChild(this.scrollbar);

    this.ctx = this.canvas.getContext("2d");
    this.audioCtx = new AudioContext();
    this.gainNode = this.audioCtx.createGain();

    this.zoom = 1;
    this.offset = 0;
    this.startpos = 0;
    this.startTime = 0;
    this.playStartOffset = 0;

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom *= e.deltaY > 0 ? 0.99 : 1.01;
      this.zoom = Math.max(1, this.zoom);
      this.updateScrollbar();
      this.render();
    });
    this.canvas.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (e.button === 2) { // ignore right click
        return;
      }
      if (!this.audioBuffer) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const clickedPixel = x;
      const totalSamples = this.audioBuffer.length;
      const samplesPerPixel = totalSamples / (this.canvas.width * this.zoom);
      const clickedSample = this.offset + clickedPixel * samplesPerPixel;
      const clickedTime = clickedSample / this.audioBuffer.sampleRate;
      this.play(clickedTime);
    });
    this.canvas.addEventListener('contextmenu', (e) => { // right click
      e.preventDefault();
      this.toggleMute();
    });
    addEventListener("keydown", (e) => {
      if (e.code == "Space") {
        if (this.source) {
          this.source.stop();
          this.source = null;
          const currentTime = this.audioCtx.currentTime - this.startTime + this.playStartOffset;
          this.playStartOffset = currentTime;
        } else {
          //const currentTime = this.audioCtx.currentTime - this.startTime + this.playStartOffset;
          //const currentTime = this.audioCtx.currentTime - this.startTime + this.playStartOffset;
          this.play(this.playStartOffset);
        }
      } else if (e.code == "Escape") {
        this.stop();
      } else if (e.code == "ArrowRight") {
        const visibleSamples = this.audioBuffer.length / this.zoom;
        this.offset = Math.min(this.offset + visibleSamples / 10, this.audioBuffer.length - visibleSamples);
        this.scrollbar.value = this.offset / this.maxOffset;
      } else if (e.code == "ArrowLeft") {        
        const visibleSamples = this.audioBuffer.length / this.zoom;
        this.offset = Math.max(this.offset - visibleSamples / 10, 0);
        this.scrollbar.value = this.offset / this.maxOffset;
      } else if (e.code == "ArrowDown") {
        const currentTime = this.audioCtx.currentTime - this.startTime + this.playStartOffset;
        console.log(currentTime.toFixed(3));
      } else {
        return;
      }
      e.preventDefault();
    });
    this.scrollbar.addEventListener("input", (e) => {
      this.offset = parseFloat(e.target.value) * this.maxOffset;
      this.render();
    });
  }
  updateScrollbar() {
    if (!this.audioBuffer) return;
    const { width } = this.canvas;
    const visibleSamples = this.audioBuffer.length / this.zoom;
    const bkmax = this.maxOffset;
    this.maxOffset = Math.max(0, this.audioBuffer.length - visibleSamples); //  / (this.audioBuffer.length / width);
    if (this.offset > this.maxOffset) {
      this.offset = this.maxOffset;
      this.scrollbar.value = this.offset ? this.offset / this.maxOffset : 0;
    }
    //this.scrollbar.value = this.scrollbar.value / bkmax * this.maxOffset;
    this.scrollbar.disabled = this.maxOffset == 0;
  }
  async load(file) {
    this.stop();
    const arrayBuffer = file instanceof Uint8Array ? file.buffer : await file.arrayBuffer();
    this.audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
    this.updateScrollbar();
    this.render();
  }

  render() {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    if (!this.audioBuffer) return;

    const data = this.audioBuffer.getChannelData(0);
    const samplesPerPixel = data.length / (width * this.zoom);
    const start = this.offset;

    /*
    if (this.playing) {
      const currentTime = this.audioCtx.currentTime - this.startTime + this.playStartOffset;
      const currentSample = currentTime * this.audioBuffer.sampleRate;
      const centerSample = currentSample;
      const visibleSamples = this.audioBuffer.length / this.zoom;
      let newStartSample = centerSample - visibleSamples / 2;
      newStartSample = Math.max(0, Math.min(newStartSample, this.audioBuffer.length - visibleSamples));
      this.offset = newStartSample;
      this.scrollbar.value = this.offset / (this.audioBuffer.length - visibleSamples) / this.maxOffset;
    }
    */

    this.ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const idx = Math.floor(start + x * samplesPerPixel);
      if (idx >= data.length) break;
      const amp = data[idx];
      const y = (1 - amp) * height / 2;
      if (x === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.stroke();

    // Draw playhead if playing
    const drawLine = (currentTime) => {
      const currentSample = currentTime * this.audioBuffer.sampleRate;
      const playheadSample = currentSample;
      const playheadPixel = (playheadSample - start) / samplesPerPixel;
      if (playheadPixel >= 0 && playheadPixel <= width) {
        this.ctx.strokeStyle = this.muted ? "gray" : "red";
        this.ctx.beginPath();
        this.ctx.moveTo(playheadPixel, 0);
        this.ctx.lineTo(playheadPixel, height);
        this.ctx.stroke();
        this.ctx.strokeStyle = 'black';
      }
    };
    if (this.source) {
      const currentTime = this.audioCtx.currentTime - this.startTime + this.playStartOffset;
      drawLine(currentTime);
      const currentSample = currentTime * this.audioBuffer.sampleRate;
      if (currentSample >= this.audioBuffer.length) {
        this.source = null;
        this.playStartOffset = 0;
      } else {
        requestAnimationFrame(() => this.render());
      }
    } else {
      drawLine(this.playStartOffset);
    }
  }

  connectedCallback() {
    this.resizeObserver = new ResizeObserver(() => {
      this.canvas.width = this.clientWidth;
      /*
      this.canvas.height = this.clientHeight;
      */
      this.render();
    });
    this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    if (this.source) this.source.stop();
  }

  play(startTime) {
    if (this.source) {
      this.source.stop();
    }
    this.source = this.audioCtx.createBufferSource();
    this.gainNode.connect(this.audioCtx.destination);
    this.source.buffer = this.audioBuffer;
    this.source.connect(this.gainNode);
    this.source.start(0, startTime);

    this.startTime = this.audioCtx.currentTime;
    this.playStartOffset = startTime;

    this.render();
  }
  stop() {
    if (this.source) {
      this.source.stop();
      this.source = null;
    }
    this.playStartOffset = 0;
    this.render();
  }
  get currentTime() {
    if (this.source) {
      const currentTime = this.audioCtx.currentTime - this.startTime + this.playStartOffset;
      return currentTime;
    } else {
      return this.playStartOffset;
    }
  }
  toggleMute() {
    this.muted = !this.muted;
    this.gainNode.gain.value = this.muted ? 0 : 1;
  }
  isPlaying() {
    return this.source != null;
  }
}

customElements.define("wave-viewer", WaveViewer);
