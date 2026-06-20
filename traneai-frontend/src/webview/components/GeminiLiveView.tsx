import React, { useEffect, useId, useMemo, useState } from 'react';
import { Rnd } from 'react-rnd';

interface GeminiLiveViewProps {
	onClose: () => void;
}

const WAVE_WIDTH = 560;
const WAVE_HEIGHT = 96;

const buildWavePath = (phase: number, amplitude: number, frequency: number, baseline: number): string => {
	let path = `M 0 ${baseline}`;

	for (let x = 0; x <= WAVE_WIDTH; x += 6) {
		const envelope = 0.35 + Math.sin((x / WAVE_WIDTH) * Math.PI) * 0.65;
		const theta = (x / WAVE_WIDTH) * Math.PI * 2 * frequency + phase;
		const y = baseline + (Math.sin(theta) * amplitude + Math.sin(theta * 0.6) * amplitude * 0.25) * envelope;
		path += ` L ${x} ${y.toFixed(2)}`;
	}

	return path;
};

const GeminiLiveView: React.FC<GeminiLiveViewProps> = ({ onClose }) => {
	const [phase, setPhase] = useState(0);
	const gradientId = useId().replace(/:/g, '');
	const [dimensions, setDimensions] = useState({ width: 720, height: 360 });
	const [position, setPosition] = useState<{ x: number; y: number }>(() => {
		const w = window.innerWidth;
		const h = window.innerHeight;
		const initialWidth = 720;
		const initialHeight = 360;

		return {
			x: Math.max(10, (w - initialWidth) / 2),
			y: Math.max(10, (h - initialHeight) / 2),
		};
	});

	useEffect(() => {
		if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return;
		}

		let animationFrame = 0;

		const animate = (time: number) => {
			setPhase(time * 0.0042);
			animationFrame = window.requestAnimationFrame(animate);
		};

		animationFrame = window.requestAnimationFrame(animate);

		return () => {
			window.cancelAnimationFrame(animationFrame);
		};
	}, []);

	useEffect(() => {
		const handleResize = () => {
			setPosition((prev) => {
				const maxX = window.innerWidth - dimensions.width - 10;
				const maxY = window.innerHeight - dimensions.height - 10;
				return {
					x: Math.min(Math.max(0, prev.x), Math.max(0, maxX)),
					y: Math.min(Math.max(0, prev.y), Math.max(0, maxY)),
				};
			});

			setDimensions((prev) => ({
				width: Math.min(prev.width, window.innerWidth - 20),
				height: Math.min(prev.height, window.innerHeight - 20),
			}));
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, [dimensions.width, dimensions.height]);

	const waveLayers = useMemo(() => {
		return [
			buildWavePath(phase + 0.2, 16, 1.2, 48),
			buildWavePath(phase * 1.18 + 1.7, 10, 1.95, 48),
			buildWavePath(phase * 1.35 + 2.9, 6, 2.7, 48),
		];
	}, [phase]);

	return (
		<Rnd
			className="gemini-live-view"
			size={{ width: dimensions.width, height: dimensions.height }}
			position={position}
			onDragStop={(e: any, d: any) => {
				setPosition({ x: d.x, y: d.y });
			}}
			onResizeStop={(e: any, direction: any, ref: any, delta: any, pos: any) => {
				setDimensions({
					width: parseInt(ref.style.width, 10),
					height: parseInt(ref.style.height, 10),
				});
				setPosition(pos);
			}}
			dragHandleClassName="gemini-live-header"
			cancel=".gemini-live-no-drag"
			minWidth={460}
			minHeight={280}
			maxWidth={Math.max(460, window.innerWidth - 20)}
			maxHeight={Math.max(280, window.innerHeight - 20)}
			bounds="window"
		>
			<div className="gemini-live-shell">
				<header className="gemini-live-header">
					<div className="gemini-live-brand-row">
						<div className="gemini-live-dot" aria-hidden="true"></div>
						<p className="gemini-live-title">Gemini Live</p>
					</div>
					<p className="gemini-live-status">Listening...</p>
				</header>

				<div className="gemini-live-content" role="presentation">
					<div className="gemini-live-wave-stage" aria-live="polite">
						<div className="gemini-live-fluid-wave" aria-hidden="true">
							<svg viewBox={`0 0 ${WAVE_WIDTH} ${WAVE_HEIGHT}`} preserveAspectRatio="none" role="presentation">
								<defs>
									<linearGradient id={`gemini-wave-gradient-${gradientId}`} x1="0%" y1="0%" x2="100%" y2="0%">
										<stop offset="0%" stopColor="#4285F4" />
										<stop offset="28%" stopColor="#34A853" />
										<stop offset="63%" stopColor="#FBBC05" />
										<stop offset="100%" stopColor="#EA4335" />
									</linearGradient>
								</defs>
								<path className="gemini-wave-layer gemini-wave-glow" d={waveLayers[0]} stroke={`url(#gemini-wave-gradient-${gradientId})`} strokeWidth="22" strokeLinecap="round" fill="none" />
								<path className="gemini-wave-layer gemini-wave-mid" d={waveLayers[1]} stroke={`url(#gemini-wave-gradient-${gradientId})`} strokeWidth="10" strokeLinecap="round" fill="none" />
								<path className="gemini-wave-layer gemini-wave-core" d={waveLayers[2]} stroke={`url(#gemini-wave-gradient-${gradientId})`} strokeWidth="5.2" strokeLinecap="round" fill="none" />
							</svg>
						</div>
						<p className="gemini-live-wave-caption">Listening...</p>
					</div>
				</div>

				<div className="gemini-live-controls gemini-live-no-drag" role="toolbar" aria-label="Gemini Live controls">
					<button className="control-btn" title="Toggle camera" aria-label="Toggle camera">
						<svg className="control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
							<circle cx="12" cy="13" r="4"></circle>
						</svg>
					</button>
					<button className="control-btn is-active" title="Screen sharing" aria-label="Screen sharing">
						<svg className="control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
							<path d="M8 21h8"></path>
							<path d="M12 17v4"></path>
							<path d="M12 8v6"></path>
							<path d="M9.5 10.5 12 8l2.5 2.5"></path>
						</svg>
					</button>
					<button className="control-btn" title="Mute microphone" aria-label="Mute microphone">
						<svg className="control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 1 0 6 0V4a3 3 0 0 0-3-3z"></path>
							<path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
							<line x1="4" y1="4" x2="20" y2="20"></line>
						</svg>
					</button>
					<button className="control-btn close-btn" title="End live session" aria-label="End live session" onClick={onClose}>
						<svg className="control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="M4 15c2.5-2 4.5-3 8-3s5.5 1 8 3"></path>
							<path d="M6 18 4 15"></path>
							<path d="M18 18 20 15"></path>
						</svg>
					</button>
				</div>
			</div>
		</Rnd>
	);
};

export default GeminiLiveView;
