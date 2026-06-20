import React, { useId } from 'react';

const GeminiLiveIcon: React.FC = React.memo(() => {
	const gradientId = useId().replace(/:/g, '');
	const gradientRef = `url(#${gradientId})`;

	return (
		<div className="sparkle-container">
			<svg className="sparkle-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
				<path d="M12 0C12 6.62742 17.3726 12 24 12C17.3726 12 12 17.3726 12 24C12 17.3726 6.62742 12 0 12C6.62742 12 12 6.62742 12 0Z" fill={gradientRef} />
				<defs>
					<linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stopColor="#EA4335">
							<animate attributeName="stop-color" values="#EA4335;#FBBC05;#34A853;#4285F4;#EA4335" dur="4s" repeatCount="indefinite" />
						</stop>
						<stop offset="25%" stopColor="#FBBC05">
							<animate attributeName="stop-color" values="#FBBC05;#34A853;#4285F4;#EA4335;#FBBC05" dur="4s" repeatCount="indefinite" />
						</stop>
						<stop offset="50%" stopColor="#34A853">
							<animate attributeName="stop-color" values="#34A853;#4285F4;#EA4335;#FBBC05;#34A853" dur="4s" repeatCount="indefinite" />
						</stop>
						<stop offset="75%" stopColor="#4285F4">
							<animate attributeName="stop-color" values="#4285F4;#EA4335;#FBBC05;#34A853;#4285F4" dur="4s" repeatCount="indefinite" />
						</stop>
						<stop offset="100%" stopColor="#EA4335">
							<animate attributeName="stop-color" values="#EA4335;#FBBC05;#34A853;#4285F4;#EA4335" dur="4s" repeatCount="indefinite" />
						</stop>
					</linearGradient>
				</defs>
			</svg>
			<div className="sparkle-glow"></div>
		</div>
	);
});

GeminiLiveIcon.displayName = 'GeminiLiveIcon';

export default GeminiLiveIcon;
