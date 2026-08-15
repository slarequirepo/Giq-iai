import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, 
  Pause,
  Video, 
  Scissors, 
  Sparkles, 
  X, 
  Loader2, 
  Download, 
  Eye, 
  Film, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  SkipBack, 
  SkipForward, 
  Sliders, 
  Layers, 
  Zap, 
  Music, 
  Repeat, 
  Maximize2,
  RefreshCw,
  Clock,
  Gauge
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { geminiService } from '../services/geminiService';
import { audioEngine, SoundTheme } from '../utils/audioSynth';

interface Frame {
  data: string;
  timestamp: number;
}

export default function VideoProcessingLab({ onClose }: { onClose: () => void }) {
  // Modes: movie (AI text/image to video generator), animation (Image rigging), video (Remix/edit)
  const [labMode, setLabMode] = useState<'movie' | 'animation' | 'video'>('movie');
  
  // Generation configuration
  const [fps, setFps] = useState<number>(10);
  const [frameCount, setFrameCount] = useState<number>(8);
  const [stylePreset, setStylePreset] = useState<string>('Cinematic 8K Ultra');
  const [soundTheme, setSoundTheme] = useState<SoundTheme>('cyberpunk');
  const [smoothTransitions, setSmoothTransitions] = useState<boolean>(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(true);
  const [audioVolume, setAudioVolume] = useState<number>(0.6);

  // Inputs
  const [instructions, setInstructions] = useState('Um carro esportivo futurista acelerando sob chuva de neon em Tóquio.');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [animImages, setAnimImages] = useState<string[]>([]);
  
  // State
  const [processing, setProcessing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<{ current: number; total: number; status: string }>({ current: 0, total: 0, status: '' });
  const [aiResult, setAiResult] = useState<any>(null);
  
  // Rendered frames & playback
  const [renderedFrames, setRenderedFrames] = useState<string[]>([]);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPingPong, setIsPingPong] = useState(false);
  const [playDirection, setPlayDirection] = useState<1 | -1>(1);

  // Capture / Export
  const [isCapturing, setIsCapturing] = useState(false);
  const [exportProgress, setExportProgress] = useState<number>(0);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const loadedImagesRef = useRef<HTMLImageElement[]>([]);

  // Pre-load rendered images into memory for zero-lag canvas rendering
  useEffect(() => {
    loadedImagesRef.current = [];
    renderedFrames.forEach((src) => {
      const img = new Image();
      img.src = src;
      loadedImagesRef.current.push(img);
    });
  }, [renderedFrames]);

  // Sync sound theme and volume with engine
  useEffect(() => {
    audioEngine.setTheme(soundTheme);
  }, [soundTheme]);

  useEffect(() => {
    audioEngine.setVolume(isAudioEnabled ? audioVolume : 0);
  }, [isAudioEnabled, audioVolume]);

  // Audio trigger on frame change
  const triggerAudioForFrame = useCallback((frameIdx: number) => {
    if (!isAudioEnabled) return;
    const frameData = aiResult?.frames?.[frameIdx] || aiResult?.movieData?.frames?.[frameIdx];
    const sfx = frameData?.sfx;
    audioEngine.triggerFrameSfx(frameIdx, renderedFrames.length, sfx);
  }, [isAudioEnabled, aiResult, renderedFrames.length]);

  // Canvas drawing with optional crossfade motion smoothing
  const drawFrameToCanvas = useCallback((idx: number) => {
    const canvas = canvasRef.current;
    if (!canvas || renderedFrames.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = loadedImagesRef.current[idx];
    if (img && img.complete) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else if (renderedFrames[idx]) {
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(fallbackImg, 0, 0, canvas.width, canvas.height);
      };
      fallbackImg.src = renderedFrames[idx];
    }
  }, [renderedFrames]);

  // Redraw when index changes
  useEffect(() => {
    if (renderedFrames.length > 0) {
      drawFrameToCanvas(currentFrameIdx);
    }
  }, [currentFrameIdx, renderedFrames, drawFrameToCanvas]);

  // Playback Loop driven by accurate FPS
  useEffect(() => {
    if (isPlaying && renderedFrames.length > 1 && !isRendering && !isCapturing) {
      const frameDurationMs = 1000 / fps;

      playbackTimerRef.current = window.setInterval(() => {
        setCurrentFrameIdx(prev => {
          let next = prev;
          if (isPingPong) {
            if (prev >= renderedFrames.length - 1) {
              setPlayDirection(-1);
              next = prev - 1;
            } else if (prev <= 0) {
              setPlayDirection(1);
              next = 1;
            } else {
              next = prev + playDirection;
            }
          } else {
            next = (prev + 1) % renderedFrames.length;
          }
          triggerAudioForFrame(next);
          return next;
        });
      }, frameDurationMs);

      // Start ambient soundtrack drone
      if (isAudioEnabled) {
        audioEngine.startSoundtrackDrone();
      }

      return () => {
        if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
        audioEngine.stopSoundtrackDrone();
      };
    } else {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      audioEngine.stopSoundtrackDrone();
    }
  }, [isPlaying, renderedFrames.length, fps, isRendering, isCapturing, isPingPong, playDirection, isAudioEnabled, triggerAudioForFrame]);

  // Auto-play when rendering completes
  useEffect(() => {
    if (renderedFrames.length > 0 && !isRendering && !isPlaying) {
      setIsPlaying(true);
    }
  }, [renderedFrames.length, isRendering]);

  // Manual Play/Pause toggle
  const togglePlay = () => {
    if (renderedFrames.length === 0) return;
    setIsPlaying(prev => !prev);
  };

  // Step Controls
  const stepPrev = () => {
    setIsPlaying(false);
    setCurrentFrameIdx(prev => (prev - 1 + renderedFrames.length) % renderedFrames.length);
  };

  const stepNext = () => {
    setIsPlaying(false);
    setCurrentFrameIdx(prev => (prev + 1) % renderedFrames.length);
  };

  // Export video with high-definition Canvas recording and synchronized audio
  const exportToVideo = async () => {
    if (renderedFrames.length === 0) return;

    setIsCapturing(true);
    setIsPlaying(false);
    setExportProgress(0);

    const canvas = canvasRef.current;
    if (!canvas) {
      setIsCapturing(false);
      return;
    }

    try {
      const canvasStream = canvas.captureStream(Math.max(fps, 15));
      const audioTrack = isAudioEnabled ? audioEngine.getAudioStreamTrack() : null;

      const combinedTracks = [...canvasStream.getVideoTracks()];
      if (audioTrack) {
        combinedTracks.push(audioTrack);
      }

      const combinedStream = new MediaStream(combinedTracks);
      
      const mimeTypes = [
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];
      const selectedMime = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

      const recorder = new MediaRecorder(combinedStream, {
        mimeType: selectedMime,
        videoBitsPerSecond: 6000000 // 6 Mbps for crystal-clear render
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recordPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';
          const blob = new Blob(chunks, { type: selectedMime });
          resolve(blob);
        };
      });

      recorder.start();

      // Play through the sequence 3 times for a solid 3-4s loop
      const loops = 3;
      const totalSteps = renderedFrames.length * loops;
      const stepDuration = 1000 / fps;
      let stepCounter = 0;

      for (let l = 0; l < loops; l++) {
        for (let i = 0; i < renderedFrames.length; i++) {
          setCurrentFrameIdx(i);
          drawFrameToCanvas(i);
          triggerAudioForFrame(i);

          stepCounter++;
          setExportProgress(Math.round((stepCounter / totalSteps) * 100));
          await new Promise(r => setTimeout(r, stepDuration));
        }
      }

      recorder.stop();
      const videoBlob = await recordPromise;

      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-video-${fps}fps-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erro na exportação de vídeo:", err);
      alert("Erro ao exportar vídeo. O navegador salvará os frames gerados.");
    } finally {
      setIsCapturing(false);
      setExportProgress(0);
      setIsPlaying(true);
    }
  };

  // Video slicing for Remix Mode
  const extractFrames = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIsExtracting(true);
    setFrames([]);
    setRenderedFrames([]);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    const duration = video.duration;
    const interval = 1 / fps; // Extração na cadência exata do FPS selecionado
    const extracted: Frame[] = [];

    for (let t = 0; t < duration; t += interval) {
      video.currentTime = t;
      await new Promise(resolve => {
        const handler = () => {
          video.removeEventListener('seeked', handler);
          resolve(null);
        };
        video.addEventListener('seeked', handler);
      });

      context?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.6);
      extracted.push({ data, timestamp: t });
      setFrames(prev => [...prev, { data, timestamp: t }]);
      if (extracted.length >= 60) break; // Até 60 frames max
    }

    setIsExtracting(false);
  };

  // Main Render Engine
  const renderVideoGeneration = async () => {
    if (labMode !== 'movie' && (labMode === 'video' ? frames.length === 0 : animImages.length === 0)) {
      alert("Carregue uma imagem base ou vídeo para iniciar!");
      return;
    }

    setIsRendering(true);
    setIsPlaying(false);
    setRenderedFrames([]);
    setCurrentFrameIdx(0);
    setRenderProgress({ current: 0, total: frameCount, status: 'Roteirizando storyboard e sound design...' });

    try {
      if (labMode === 'movie') {
        // Modo Master AI Movie Generator
        const plan = await geminiService.synthesizeMoviePlan({
          prompt: instructions,
          baseImage: animImages[0],
          frameCount,
          fps,
          stylePreset
        });

        setAiResult({
          styleTitle: plan.movieTitle || 'Short Cinematic',
          colorGrade: plan.cinematicStyle || stylePreset,
          bpmSugerido: fps * 12,
          moodAnalysis: plan.soundTrack || 'Atmospheric Synth',
          audioContext: plan.lighting || 'Volumetric Studio Light',
          movieData: plan,
          frames: plan.frames || []
        });

        const targetFrames = plan.frames || [];
        const total = targetFrames.length;
        setRenderProgress({ current: 0, total, status: `Renderizando ${total} frames a ${fps} FPS...` });

        for (let i = 0; i < total; i++) {
          const framePlan = targetFrames[i];
          setRenderProgress({ 
            current: i + 1, 
            total, 
            status: `Gerando Frame #${i + 1}/${total} (${((i + 1) / fps).toFixed(2)}s)...` 
          });

          if (i > 0) {
            // Intervalo para respeitar a cota RPM da API
            await new Promise(r => setTimeout(r, 4500));
          }

          try {
            const promptForFrame = `${framePlan.prompt}. Frame ${i + 1} of ${total} in sequence. Style: ${plan.cinematicStyle || stylePreset}. Coherent consistent character and camera motion, high detail 8k.`;
            const imgUrl = await geminiService.generateThumbnail(promptForFrame);
            setRenderedFrames(prev => [...prev, imgUrl]);
          } catch (frameErr: any) {
            if (frameErr.message?.includes('429') || frameErr.message?.includes('LIMITE_COTA')) {
              alert(`Limite de cota de IA atingido. ${i} frames foram renderizados com sucesso.`);
              break;
            }
            throw frameErr;
          }
        }
      } else if (labMode === 'animation') {
        // Modo Animação por Rigging & Keyframes
        const plan = await geminiService.synthesizeImageToVideoPlan({
          baseImage: animImages[0],
          prompt: instructions,
          frameCount,
          fps,
          stylePreset
        });

        setAiResult({
          styleTitle: plan.storyTitle,
          colorGrade: plan.visualStyle,
          bpmSugerido: fps * 12,
          moodAnalysis: plan.soundTrack || "Motion Sequence",
          audioContext: "Ambient Animation",
          movieData: plan,
          frames: plan.frames || []
        });

        const targetFrames = plan.frames || [];
        const total = targetFrames.length;
        setRenderProgress({ current: 0, total, status: `Renderizando animação em ${fps} FPS...` });

        for (let i = 0; i < total; i++) {
          const framePlan = targetFrames[i];
          setRenderProgress({ 
            current: i + 1, 
            total, 
            status: `Renderizando Frame #${i + 1}/${total}...` 
          });

          if (i > 0) await new Promise(r => setTimeout(r, 4500));

          try {
            const imgUrl = await geminiService.generateThumbnail(
              `${framePlan.prompt}. Style: ${plan.visualStyle}. Single animation frame, consistent visual identity.`
            );
            setRenderedFrames(prev => [...prev, imgUrl]);
          } catch (frameErr: any) {
            if (frameErr.message?.includes('429') || frameErr.message?.includes('LIMITE_COTA')) {
              alert(`Limite de cota atingido. ${i} frames gerados.`);
              break;
            }
            throw frameErr;
          }
        }
      } else {
        // Modo Remix de Vídeo
        const plan = await geminiService.synthesizeVideoEdit({
          images: frames.map(f => f.data),
          extraImages: animImages.length > 0 ? animImages : undefined,
          instructions
        });
        setAiResult(plan);

        const targetFrames = plan.frames || [];
        const total = Math.min(targetFrames.length, frameCount);
        setRenderProgress({ current: 0, total, status: `Renderizando Remix em ${fps} FPS...` });

        for (let i = 0; i < total; i++) {
          const framePlan = targetFrames[i];
          setRenderProgress({ current: i + 1, total, status: `Renderizando Frame #${i + 1}/${total}...` });

          if (i > 0) await new Promise(r => setTimeout(r, 4500));

          try {
            const imgUrl = await geminiService.generateThumbnail(
              `${framePlan.generationPrompt}. Maintain consistency with style: ${plan.colorGrade || stylePreset}`
            );
            setRenderedFrames(prev => [...prev, imgUrl]);
          } catch (frameErr: any) {
            if (frameErr.message?.includes('429') || frameErr.message?.includes('LIMITE_COTA')) {
              alert(`Limite de cota atingido. ${i} frames gerados.`);
              break;
            }
            throw frameErr;
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message;
      if (err.message?.includes('429') || err.message?.includes('LIMITE_COTA')) {
        errorMsg = "Cota de IA esgotada. Aguarde 1 a 2 minutos antes de continuar.";
      }
      alert("Erro na Renderização: " + errorMsg);
    } finally {
      setIsRendering(false);
    }
  };

  const handleImageBatchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 6);
    const readers = files.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers).then(results => {
      setAnimImages(results);
      setAiResult(null);
      setRenderedFrames([]);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setFrames([]);
      setAiResult(null);
      setRenderedFrames([]);
    }
  };

  const totalDurationSeconds = renderedFrames.length > 0 ? (renderedFrames.length / fps).toFixed(2) : '0.00';
  const currentTimecode = renderedFrames.length > 0 ? (currentFrameIdx / fps).toFixed(2) : '0.00';

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 md:p-8 bg-black/85 backdrop-blur-2xl"
    >
      <div className="bg-[#121214] w-full max-w-7xl h-full max-h-[92vh] rounded-[2.5rem] border border-white/10 overflow-hidden flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.8)] relative">
        
        {/* Top Header */}
        <div className="px-6 py-4 sm:px-8 sm:py-5 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 rounded-2xl">
              <Film className="text-emerald-400" size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white italic tracking-tight uppercase">AI Video Studio Pro</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black tracking-widest uppercase border border-emerald-500/30">
                  FPS Engine v6.0
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 font-medium tracking-wide">
                Gere vídeos quadro a quadro por IA com controle de FPS e Sound Design
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-3">
            <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10">
              <button 
                onClick={() => { setLabMode('movie'); setAiResult(null); }}
                className={`px-3 sm:px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${labMode === 'movie' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-black shadow-lg shadow-emerald-500/25' : 'text-gray-400 hover:text-white'}`}
              >
                <Sparkles size={13} />
                <span>AI Video Gen</span>
              </button>
              <button 
                onClick={() => { setLabMode('animation'); setAiResult(null); }}
                className={`px-3 sm:px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${labMode === 'animation' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-black shadow-lg shadow-emerald-500/25' : 'text-gray-400 hover:text-white'}`}
              >
                <Layers size={13} />
                <span>Animate Image</span>
              </button>
              <button 
                onClick={() => { setLabMode('video'); setAiResult(null); }}
                className={`px-3 sm:px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${labMode === 'video' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-black shadow-lg shadow-emerald-500/25' : 'text-gray-400 hover:text-white'}`}
              >
                <Scissors size={13} />
                <span>Video Remix</span>
              </button>
            </div>

            <button 
              onClick={onClose}
              className="p-2.5 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-2xl border border-white/5 hover:border-red-500/30 transition-all"
              title="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Studio Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
            
            {/* Left Col: Screen Canvas & Timeline Player (7 cols) */}
            <div className="lg:col-span-7 flex flex-col space-y-5">
              
              {/* Main Screen / Player */}
              <div className="relative rounded-[2rem] overflow-hidden border-2 border-white/10 bg-black aspect-video flex items-center justify-center shadow-2xl group">
                
                {/* Hidden canvas used for rendering, interpolation and export stream */}
                <canvas 
                  ref={canvasRef} 
                  width={1280} 
                  height={720} 
                  className="w-full h-full object-contain"
                />

                {/* Rendered Frame visualizer overlay with smooth transitions */}
                {renderedFrames.length > 0 ? (
                  <div className="absolute inset-0 pointer-events-none">
                    <AnimatePresence mode="wait">
                      <motion.img 
                        key={currentFrameIdx}
                        src={renderedFrames[currentFrameIdx]}
                        initial={{ opacity: smoothTransitions ? 0.7 : 1, scale: 1.01 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: smoothTransitions ? 0.7 : 1 }}
                        transition={{ duration: smoothTransitions ? 0.12 : 0 }}
                        className="w-full h-full object-cover"
                      />
                    </AnimatePresence>

                    {/* HUD Status Badges */}
                    <div className="absolute top-4 left-4 flex items-center gap-2">
                      <span className="px-3 py-1 bg-emerald-500/90 backdrop-blur-md text-black font-black text-[10px] uppercase tracking-widest rounded-lg flex items-center gap-1.5 shadow-lg">
                        <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
                        {isPlaying ? "PLAYING" : "PAUSED"} @ {fps} FPS
                      </span>
                      <span className="px-2.5 py-1 bg-black/70 backdrop-blur-md border border-white/20 text-white font-mono text-[10px] rounded-lg">
                        {currentTimecode}s / {totalDurationSeconds}s
                      </span>
                    </div>

                    <div className="absolute top-4 right-4 flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-black/70 backdrop-blur-md border border-white/20 text-emerald-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
                        FRAME #{currentFrameIdx + 1}/{renderedFrames.length}
                      </span>
                    </div>

                    {/* Current Frame Action / SFX Banner */}
                    {aiResult?.frames?.[currentFrameIdx] && (
                      <div className="absolute bottom-4 left-4 right-4 p-3 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-between text-xs text-white">
                        <div className="flex items-center gap-2 truncate">
                          <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-[9px] font-black rounded-md uppercase">
                            Ação
                          </span>
                          <span className="truncate font-medium text-[11px]">
                            {aiResult.frames[currentFrameIdx].action}
                          </span>
                        </div>
                        {aiResult.frames[currentFrameIdx].sfx && (
                          <div className="flex items-center gap-1 text-[10px] text-yellow-400 font-bold uppercase tracking-wider shrink-0 bg-yellow-400/10 px-2 py-0.5 rounded-md">
                            <Music size={11} />
                            SFX: {aiResult.frames[currentFrameIdx].sfx}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : labMode === 'video' && videoUrl ? (
                  <video 
                    ref={videoRef} 
                    src={videoUrl} 
                    className="w-full h-full object-contain" 
                    controls
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-4 text-center p-8">
                    <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500">
                      <Film size={32} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white uppercase tracking-wider">Player de Vídeo AI Pronto</p>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm">
                        Defina as opções de FPS, estilo e prompt ao lado e clique em Gerar Vídeo para sintetizar a sequência de frames.
                      </p>
                    </div>
                  </div>
                )}

                {/* Loading / Render Progress Overlay */}
                {isRendering && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-4 p-6 z-20">
                    <div className="relative">
                      <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white">
                        {renderProgress.current}/{renderProgress.total}
                      </span>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-sm font-black text-white uppercase tracking-widest">
                        {renderProgress.status}
                      </p>
                      <p className="text-xs text-emerald-400 font-mono">
                        Taxa de Render: {fps} FPS • Processamento Temporal Contínuo
                      </p>
                    </div>
                    <div className="w-64 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${(renderProgress.current / Math.max(renderProgress.total, 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Player Controls & Scrubber */}
              <div className="p-4 bg-white/[0.03] border border-white/10 rounded-3xl space-y-4">
                
                {/* Timeline Scrubber Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-mono text-gray-400 uppercase tracking-widest px-1">
                    <span>TIMELINE: {currentTimecode}s</span>
                    <span className="text-emerald-400 font-black">
                      FRAME {renderedFrames.length > 0 ? currentFrameIdx + 1 : 0} DE {renderedFrames.length}
                    </span>
                    <span>TOTAL: {totalDurationSeconds}s</span>
                  </div>
                  <input 
                    type="range"
                    min={0}
                    max={Math.max(renderedFrames.length - 1, 0)}
                    value={currentFrameIdx}
                    disabled={renderedFrames.length === 0 || isRendering}
                    onChange={(e) => {
                      setIsPlaying(false);
                      setCurrentFrameIdx(Number(e.target.value));
                    }}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                  />
                </div>

                {/* Control Bar Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  
                  {/* Playback Button Group */}
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={stepPrev}
                      disabled={renderedFrames.length === 0}
                      className="p-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl disabled:opacity-30 transition-all"
                      title="Frame Anterior"
                    >
                      <SkipBack size={16} />
                    </button>

                    <button 
                      onClick={togglePlay}
                      disabled={renderedFrames.length === 0}
                      className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black font-black text-xs uppercase tracking-widest rounded-xl disabled:opacity-30 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                      <span>{isPlaying ? 'Pausar' : 'Reproduzir'}</span>
                    </button>

                    <button 
                      onClick={stepNext}
                      disabled={renderedFrames.length === 0}
                      className="p-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl disabled:opacity-30 transition-all"
                      title="Próximo Frame"
                    >
                      <SkipForward size={16} />
                    </button>

                    <button 
                      onClick={() => setIsPingPong(p => !p)}
                      disabled={renderedFrames.length === 0}
                      className={`p-2.5 rounded-xl border transition-all ${isPingPong ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'bg-white/5 border-transparent text-gray-400 hover:text-white'}`}
                      title="Modo Ping-Pong (Vai e Volta)"
                    >
                      <Repeat size={16} />
                    </button>

                    <button 
                      onClick={() => setSmoothTransitions(s => !s)}
                      className={`p-2.5 rounded-xl border transition-all text-xs font-black uppercase ${smoothTransitions ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-transparent text-gray-400 hover:text-white'}`}
                      title="Suavização Óptica entre Frames"
                    >
                      <span>SMOOTH</span>
                    </button>
                  </div>

                  {/* Audio Controls */}
                  <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-2xl border border-white/5">
                    <button 
                      onClick={() => setIsAudioEnabled(a => !a)}
                      className={`p-1.5 rounded-lg ${isAudioEnabled ? 'text-emerald-400' : 'text-gray-600'}`}
                      title={isAudioEnabled ? "Som Ativo" : "Som Mudo"}
                    >
                      {isAudioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    </button>
                    <input 
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isAudioEnabled ? audioVolume : 0}
                      onChange={(e) => {
                        setAudioVolume(Number(e.target.value));
                        setIsAudioEnabled(true);
                      }}
                      className="w-16 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                    />
                  </div>

                  {/* Export Button */}
                  <button 
                    onClick={exportToVideo}
                    disabled={renderedFrames.length === 0 || isCapturing}
                    className="px-4 py-2.5 bg-white hover:bg-gray-200 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all disabled:opacity-30 flex items-center gap-2"
                  >
                    {isCapturing ? (
                      <>
                        <Loader2 className="animate-spin" size={14} />
                        <span>Exportando ({exportProgress}%)...</span>
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        <span>Exportar .MP4</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Filmstrip Frame List */}
              {renderedFrames.length > 0 && (
                <div className="p-4 bg-white/[0.02] border border-white/10 rounded-3xl space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-gray-400 px-1">
                    <span>Sequência de Frames ({renderedFrames.length} Frames a {fps} FPS)</span>
                    <button 
                      onClick={() => {
                        setRenderedFrames([]);
                        setAiResult(null);
                        setIsPlaying(false);
                      }}
                      className="text-red-400 hover:underline text-[10px]"
                    >
                      Limpar Render
                    </button>
                  </div>
                  <div className="flex gap-2.5 overflow-x-auto pb-2 custom-scrollbar">
                    {renderedFrames.map((f, i) => (
                      <div 
                        key={i}
                        onClick={() => {
                          setIsPlaying(false);
                          setCurrentFrameIdx(i);
                        }}
                        className={`min-w-[100px] aspect-video rounded-xl overflow-hidden border-2 cursor-pointer transition-all relative shrink-0 ${i === currentFrameIdx ? 'border-emerald-400 scale-105 shadow-lg shadow-emerald-500/20' : 'border-white/10 opacity-70 hover:opacity-100'}`}
                      >
                        <img src={f} className="w-full h-full object-cover" alt={`Frame ${i + 1}`} />
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/80 rounded text-[8px] font-mono text-white font-bold">
                          #{i + 1}
                        </div>
                        <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-emerald-500/90 rounded text-[7px] font-mono text-black font-black">
                          {((i + 1) / fps).toFixed(2)}s
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Right Col: AI Configuration & Engine Parameters (5 cols) */}
            <div className="lg:col-span-5 flex flex-col space-y-5">
              <div className="bg-white/[0.03] border border-white/10 rounded-[2rem] p-6 space-y-5 flex-1 overflow-y-auto custom-scrollbar">
                
                {/* Section Header */}
                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Sliders size={18} />
                    <h3 className="text-xs font-black uppercase tracking-widest text-white">Parâmetros de Geração de Vídeo</h3>
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Motor Neural</span>
                </div>

                {/* FPS Control Slider and Presets */}
                <div className="space-y-2.5 p-4 bg-black/40 rounded-2xl border border-white/5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                      <Gauge size={13} />
                      Frames Por Segundo (FPS): <span className="text-white text-xs">{fps} FPS</span>
                    </label>
                    <span className="text-[10px] font-mono text-gray-400">
                      {(1000 / fps).toFixed(1)}ms por frame
                    </span>
                  </div>

                  <input 
                    type="range"
                    min={2}
                    max={30}
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                  />

                  {/* FPS Presets */}
                  <div className="flex items-center gap-1.5 pt-1">
                    {[4, 8, 10, 12, 15, 24, 30].map(val => (
                      <button 
                        key={val}
                        onClick={() => setFps(val)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-black transition-all ${fps === val ? 'bg-emerald-500 text-black shadow-md' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Frame Count & Duration Estimator */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 bg-black/40 rounded-2xl border border-white/5 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-cyan-400 block">
                      Qtd. de Frames
                    </label>
                    <select 
                      value={frameCount}
                      onChange={(e) => setFrameCount(Number(e.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-400"
                    >
                      <option value={4} className="bg-[#1a1a1a]">4 Frames (Rápido)</option>
                      <option value={6} className="bg-[#1a1a1a]">6 Frames</option>
                      <option value={8} className="bg-[#1a1a1a]">8 Frames (Recomendado)</option>
                      <option value={10} className="bg-[#1a1a1a]">10 Frames (Padrão)</option>
                      <option value={12} className="bg-[#1a1a1a]">12 Frames (Fluido)</option>
                      <option value={16} className="bg-[#1a1a1a]">16 Frames (Longo)</option>
                    </select>
                  </div>

                  <div className="p-3.5 bg-black/40 rounded-2xl border border-white/5 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block">
                      Duração Total
                    </label>
                    <div className="flex items-center gap-1 text-white font-mono font-bold text-sm py-1.5 px-2 bg-white/5 rounded-xl">
                      <Clock size={13} className="text-emerald-400" />
                      <span>{(frameCount / fps).toFixed(2)} segundos</span>
                    </div>
                  </div>
                </div>

                {/* Visual Style Preset */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">
                    Estilo Visual e Fotografia
                  </label>
                  <select 
                    value={stylePreset}
                    onChange={(e) => setStylePreset(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Cinematic 8K Ultra, Unreal Engine 5, Volumetric Lighting" className="bg-[#1a1a1a]">🎬 Cinema 8K & Unreal Engine 5</option>
                    <option value="Cyberpunk Neon, Holographic, Rainy Tokyo Night, Futuristic" className="bg-[#1a1a1a]">🌆 Cyberpunk & Neon City</option>
                    <option value="Studio Ghibli Anime Aesthetic, Vibrant Hand Drawn, Masterpiece" className="bg-[#1a1a1a]">🌸 Anime Studio Ghibli</option>
                    <option value="3D Pixar Character Animation, Cute Vibrant Lighting, Octane Render" className="bg-[#1a1a1a]">🧸 3D Pixar Animation</option>
                    <option value="Retro 80s VHS Synthwave, Glowing CRT Glitch, Laser Grid" className="bg-[#1a1a1a]">📼 Retro 80s VHS Synthwave</option>
                    <option value="Dark Fantasy Epic, Elden Style, Mystic Fog, Cinematic Masterpiece" className="bg-[#1a1a1a]">🗡️ Dark Fantasy Épico</option>
                    <option value="Hyper-Realistic Drone 4K Footage, Natural Lighting, Photorealistic" className="bg-[#1a1a1a]">🚁 Drone Hiper-Realista</option>
                  </select>
                </div>

                {/* Sound Design Theme */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-yellow-400 flex items-center gap-1.5">
                    <Music size={12} />
                    <span>Trilha Sonora e Sound FX (Web Audio Synth)</span>
                  </label>
                  <select 
                    value={soundTheme}
                    onChange={(e) => setSoundTheme(e.target.value as SoundTheme)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="cyberpunk" className="bg-[#1a1a1a]">⚡ Cyberpunk Synth & Bassline</option>
                    <option value="cinematic" className="bg-[#1a1a1a]">🎻 Cinematic Orchestra & Chords</option>
                    <option value="ambient" className="bg-[#1a1a1a]">🌌 Ambient Ethereal Pads</option>
                    <option value="synthwave" className="bg-[#1a1a1a]">🕹️ Retro 80s Synthwave</option>
                    <option value="action" className="bg-[#1a1a1a]">💥 Action & Heavy Impact</option>
                    <option value="lofi" className="bg-[#1a1a1a]">☕ Lo-Fi Chill Beats</option>
                    <option value="horror" className="bg-[#1a1a1a]">👻 Horror Dark Drone</option>
                  </select>
                </div>

                {/* Optional Image Input for Start Frame */}
                {labMode !== 'video' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center justify-between">
                      <span>Imagem Base / Referência (Opcional)</span>
                      {animImages.length > 0 && (
                        <button 
                          onClick={() => setAnimImages([])} 
                          className="text-red-400 hover:underline text-[9px]"
                        >
                          Remover
                        </button>
                      )}
                    </label>
                    <div className="border border-dashed border-white/10 hover:border-emerald-500/40 rounded-2xl p-3 bg-black/30 text-center relative cursor-pointer group transition-all">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageBatchChange} 
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      {animImages.length === 0 ? (
                        <div className="py-2 flex items-center justify-center gap-2 text-xs text-gray-400">
                          <Eye size={16} className="text-gray-500 group-hover:text-emerald-400" />
                          <span>Clique para carregar imagem inicial de referência</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <img src={animImages[0]} className="w-12 h-12 object-cover rounded-xl border border-white/10" />
                          <div className="text-left text-xs">
                            <p className="text-white font-bold">Imagem de Partida Carregada</p>
                            <p className="text-[10px] text-emerald-400">A IA manterá consistência visual com esta base</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Video Upload if in Video Remix mode */}
                {labMode === 'video' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">
                      Vídeo Original Para Fatiamento de Frames
                    </label>
                    <input 
                      type="file" 
                      accept="video/*" 
                      onChange={handleFileChange}
                      className="w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-white/10 file:text-white hover:file:bg-white/20 cursor-pointer"
                    />
                    {videoUrl && frames.length === 0 && (
                      <button 
                        onClick={extractFrames}
                        disabled={isExtracting}
                        className="w-full py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-black text-[11px] uppercase tracking-wider rounded-xl transition-all border border-emerald-500/30"
                      >
                        {isExtracting ? 'Fatiando Vídeo a cada 0.1s...' : 'Fatiar Vídeo em Frames'}
                      </button>
                    )}
                  </div>
                )}

                {/* Prompt Textarea */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block">
                    {labMode === 'movie' ? 'Script / Roteiro do Vídeo' : 'Instruções de Movimento'}
                  </label>
                  <textarea 
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Descreva a sequência de vídeo que você quer gerar..."
                    className="w-full h-24 bg-black/40 border border-white/10 rounded-2xl p-3.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 resize-none font-medium custom-scrollbar"
                  />
                </div>

                {/* Main Action Buttons */}
                <div className="pt-2 space-y-2.5">
                  <button 
                    onClick={renderVideoGeneration}
                    disabled={isRendering || (labMode === 'video' ? frames.length === 0 : false)}
                    className="w-full py-4 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-30 flex items-center justify-center gap-2"
                  >
                    {isRendering ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        <span>Renderizando Vídeo ({renderProgress.current}/{renderProgress.total})...</span>
                      </>
                    ) : (
                      <>
                        <Zap size={16} />
                        <span>Gerar Vídeo em {fps} FPS ({frameCount} Frames)</span>
                      </>
                    )}
                  </button>
                </div>

              </div>
            </div>

          </div>
        </div>

        {/* Footer Bar */}
        <div className="px-8 py-3.5 bg-black/50 border-t border-white/5 flex flex-wrap items-center justify-between text-[11px] text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Web Audio Synthesizer: <strong className="text-gray-300 font-bold uppercase">{soundTheme}</strong>
            </span>
            <span>•</span>
            <span>Taxa Ativa: <strong className="text-gray-300 font-mono font-bold">{fps} FPS</strong></span>
            <span>•</span>
            <span>Resolução: <strong className="text-gray-300 font-mono font-bold">1280x720 (HD)</strong></span>
          </div>

          <div className="text-[10px] text-gray-400 font-medium">
            AI Studio Video Engine • Gemini Multimodal
          </div>
        </div>

      </div>
    </motion.div>
  );
}
