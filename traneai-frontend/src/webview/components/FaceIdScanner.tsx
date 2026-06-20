import React, { useState, useEffect, useRef } from 'react';
import { Button, Card, Progress, Space, Typography, Alert } from 'antd';
import { CameraOutlined, CloseCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface FaceIdScannerProps {
	onCancel: () => void;
}

export const FaceIdScanner: React.FC<FaceIdScannerProps> = ({ onCancel }) => {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [scanProgress, setScanProgress] = useState(0);
	const [cameraError, setCameraError] = useState(false);
	const [cameraReady, setCameraReady] = useState(false);

	useEffect(() => {
		let stream: MediaStream | null = null;
		let progressInterval: NodeJS.Timeout;

		const startProgress = () => {
			progressInterval = setInterval(() => {
				setScanProgress((p) => {
					if (p >= 100) {
						clearInterval(progressInterval);
						return 100;
					}
					return p + 2;
				});
			}, 50);
		};

		setScanProgress(0);
		setCameraError(false);

		if (navigator.mediaDevices?.getUserMedia) {
			navigator.mediaDevices
				.getUserMedia({ video: true })
				.then((s) => {
					stream = s;
					if (videoRef.current) {
						videoRef.current.srcObject = s;
					}
					setCameraReady(true);
					startProgress();
				})
				.catch((err) => {
					console.error('Error accessing camera:', err);
					setCameraError(true);
					setCameraReady(false);
					startProgress();
				});
		} else {
			console.error('Camera API not supported in this environment.');
			setCameraError(true);
			setCameraReady(false);
			startProgress();
		}

		return () => {
			if (progressInterval) {
				clearInterval(progressInterval);
			}
			if (stream) {
				stream.getTracks().forEach((track) => track.stop());
			}
		};
	}, []);

	return (
		<Card className="face-scan-card" bordered={false}>
			<Space direction="vertical" size="large" className="face-scan-view">
				<div className="face-scan-header">
					<Title level={4} className="scan-header-title">
						Face ID Authentication
					</Title>
					<Text className="scan-helper-text">Position your face inside the frame to complete secure verification.</Text>
				</div>

				<div className="camera-card">
					<div className="camera-frame">
						{cameraError ? (
							<div className="camera-fallback">
								<CameraOutlined className="camera-fallback-icon" />
								<Text className="camera-fallback-text">
									Unable to access the camera. Please allow permissions or try again.
								</Text>
							</div>
						) : (
							<video
								ref={videoRef}
								autoPlay
								playsInline
								muted
								className="camera-video"
							/>
						)}
						{!cameraError && (
							<div className="face-overlay">
								<div className="face-ring" />
								<div className="face-oval" />
								<div className="scanner-beam" />
							</div>
						)}
					</div>
				</div>

{!cameraReady && (
						<div className="scan-progress-panel">
							<Space direction="vertical" size={6} className="scan-info">
								<Space align="center">
									<SafetyCertificateOutlined />
									<Text strong>Preparing camera</Text>
								</Space>
								<Progress
									percent={scanProgress}
									status={scanProgress < 100 ? 'active' : 'success'}
									strokeColor={{ '0%': '#5eead4', '100%': '#38bdf8' }}
									trailColor="rgba(255,255,255,0.08)"
									strokeWidth={12}
									showInfo={false}
								/>
								<Text className="scan-status-text">
									Waiting for camera access and initializing the scan.
								</Text>
							</Space>
						</div>
					)}

					{cameraReady && (
						<div className="scan-progress-panel scan-status-only">
							<Text className="scan-status-text">
								Camera active. Align your face with the guide ring to verify.
							</Text>
						</div>
					)}

				<div className="face-scan-actions">
					<Button type="default" onClick={onCancel} icon={<CloseCircleOutlined />}>
						Cancel
					</Button>
				</div>
			</Space>
		</Card>
	);
};
