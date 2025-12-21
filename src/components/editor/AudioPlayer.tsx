import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Settings,
  Music,
} from "lucide-react";

interface AudioPlayerProps {
  src: string;
  title?: string;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Custom audio player with controls
 * - Play/Pause
 * - Seekable progress bar
 * - Volume slider + Mute toggle
 * - Playback speed selector
 */
export function AudioPlayer({ src, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Get filename from path
  const getDisplayTitle = (): string => {
    if (title) return title;
    
    try {
      const parts = src.split("/");
      const filename = parts[parts.length - 1];
      // Remove UUID prefix if present
      const match = filename.match(/^attachment-[a-f0-9-]+\.(.+)$/);
      if (match) {
        return `Audio file`;
      }
      return filename;
    } catch {
      return "Audio";
    }
  };

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  }, [isPlaying]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Handle volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = parseFloat(e.target.value);
    audio.volume = newVolume;
    setVolume(newVolume);
    
    if (newVolume === 0) {
      setIsMuted(true);
      audio.muted = true;
    } else if (isMuted) {
      setIsMuted(false);
      audio.muted = false;
    }
  }, [isMuted]);

  // Handle seeking
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const progress = progressRef.current;
    if (!audio || !progress) return;

    const rect = progress.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pos * duration;
  }, [duration]);

  // Handle playback speed change
  const handleSpeedChange = useCallback((speed: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.playbackRate = speed;
    setPlaybackRate(speed);
    setShowSpeedMenu(false);
  }, []);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };
    const handleError = () => {
      setError("Failed to load audio");
      setIsLoading(false);
    };
    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("error", handleError);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Close speed menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".audio-speed-control")) {
        setShowSpeedMenu(false);
      }
    };

    if (showSpeedMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showSpeedMenu]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (error) {
    return (
      <div className="audio-player-error">
        <Music size={24} />
        <p>{error}</p>
        <a href={src} target="_blank" rel="noopener noreferrer">
          Download audio
        </a>
      </div>
    );
  }

  return (
    <div className="audio-player-container">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Icon and title */}
      <div className="audio-info">
        <div className="audio-icon">
          <Music size={24} />
        </div>
        <div className="audio-details">
          <span className="audio-title">{getDisplayTitle()}</span>
          <span className="audio-duration">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div
        ref={progressRef}
        className="audio-progress"
        onClick={handleProgressClick}
      >
        <div className="audio-progress-bar">
          <div
            className="audio-progress-filled"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="audio-controls">
        <button
          className="audio-control-btn audio-play-btn"
          onClick={togglePlay}
          title={isPlaying ? "Pause" : "Play"}
          disabled={isLoading}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>

        <div className="audio-volume-control">
          <button
            className="audio-control-btn"
            onClick={toggleMute}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="audio-volume-slider"
          />
        </div>

        <div className="audio-speed-control">
          <button
            className="audio-control-btn audio-speed-btn"
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            title="Playback speed"
          >
            <Settings size={16} />
            <span>{playbackRate}x</span>
          </button>
          
          {showSpeedMenu && (
            <div className="audio-speed-menu">
              {PLAYBACK_SPEEDS.map((speed) => (
                <button
                  key={speed}
                  className={`audio-speed-option ${playbackRate === speed ? "active" : ""}`}
                  onClick={() => handleSpeedChange(speed)}
                >
                  {speed}x
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AudioPlayer;
