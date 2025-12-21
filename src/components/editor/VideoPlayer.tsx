import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
} from "lucide-react";

interface VideoPlayerProps {
  src: string;
  title?: string;
  poster?: string;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Custom video player with standard controls
 * - Play/Pause
 * - Seekable progress bar
 * - Volume slider + Mute toggle
 * - Playback speed selector
 * - Fullscreen toggle
 */
export function VideoPlayer({ src, title, poster }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hideControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Format time as mm:ss or hh:mm:ss
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  }, [isPlaying]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Handle volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
    
    if (newVolume === 0) {
      setIsMuted(true);
      video.muted = true;
    } else if (isMuted) {
      setIsMuted(false);
      video.muted = false;
    }
  }, [isMuted]);

  // Handle seeking
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const progress = progressRef.current;
    if (!video || !progress) return;

    const rect = progress.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * duration;
  }, [duration]);

  // Handle playback speed change
  const handleSpeedChange = useCallback((speed: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = speed;
    setPlaybackRate(speed);
    setShowSpeedMenu(false);
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  }, []);

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    setShowControls(true);
    
    if (isPlaying) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setShowSpeedMenu(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
    };
    const handleError = () => {
      setError("Failed to load video");
      setIsLoading(false);
    };
    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("canplay", handleCanPlay);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, []);

  // Fullscreen change handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if this video container is focused
      if (!containerRef.current?.contains(document.activeElement)) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.currentTime -= 5;
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.currentTime += 5;
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, toggleMute, toggleFullscreen]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (error) {
    return (
      <div className="video-player-error">
        <p>{error}</p>
        <a href={src} target="_blank" rel="noopener noreferrer">
          Open video directly
        </a>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`video-player-container ${isFullscreen ? "fullscreen" : ""}`}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      tabIndex={0}
    >
      {title && <div className="video-title">{title}</div>}
      
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="video-element"
        onClick={togglePlay}
        playsInline
      />

      {isLoading && (
        <div className="video-loading">
          <div className="video-spinner" />
        </div>
      )}

      {/* Controls overlay */}
      <div className={`video-controls ${showControls ? "visible" : ""}`}>
        {/* Progress bar */}
        <div
          ref={progressRef}
          className="video-progress"
          onClick={handleProgressClick}
        >
          <div className="video-progress-bar">
            <div
              className="video-progress-filled"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Control buttons */}
        <div className="video-controls-row">
          {/* Left side: Play, Volume, Time */}
          <div className="video-controls-left">
            <button
              className="video-control-btn"
              onClick={togglePlay}
              title={isPlaying ? "Pause (k)" : "Play (k)"}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>

            <div className="video-volume-control">
              <button
                className="video-control-btn"
                onClick={toggleMute}
                title={isMuted ? "Unmute (m)" : "Mute (m)"}
              >
                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="video-volume-slider"
              />
            </div>

            <span className="video-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right side: Speed, Fullscreen */}
          <div className="video-controls-right">
            <div className="video-speed-control">
              <button
                className="video-control-btn video-speed-btn"
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                title="Playback speed"
              >
                <Settings size={18} />
                <span>{playbackRate}x</span>
              </button>
              
              {showSpeedMenu && (
                <div className="video-speed-menu">
                  {PLAYBACK_SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      className={`video-speed-option ${playbackRate === speed ? "active" : ""}`}
                      onClick={() => handleSpeedChange(speed)}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              className="video-control-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen (f)" : "Fullscreen (f)"}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Big play button overlay when paused */}
      {!isPlaying && !isLoading && (
        <button className="video-big-play" onClick={togglePlay}>
          <Play size={48} />
        </button>
      )}
    </div>
  );
}

export default VideoPlayer;
