import React, { useState } from 'react';
import { Form, Input, Button } from 'antd';
import { ScanOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { FaceIdScanner } from './FaceIdScanner';

interface LoginValues {
	email: string;
	password: string;
}

interface LoginPageProps {
	logoUri: string;
	onSwitchToSignup: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ logoUri, onSwitchToSignup }) => {
	const { login, isLoading } = useAuth();
	const [form] = Form.useForm<LoginValues>();
	const [isScanningFace, setIsScanningFace] = useState(false);

	const handleFinish = (values: LoginValues) => {
		login(values.email, values.password);
	};

	return (
		<div className="login-page">
			<div className="login-logo-wrap">
				<img src={logoUri} alt="TraneAI" />
			</div>
			{isScanningFace ? (
				<FaceIdScanner onCancel={() => setIsScanningFace(false)} />
			) : (
				<>
					<div className="login-title">
						Welcome to <span>TraneAI</span>
					</div>
					<p className="login-subtitle">Sign in to continue</p>

					<Form
						form={form}
						layout="vertical"
						onFinish={handleFinish}
						requiredMark={false}
						className="login-form"
					>
						<Form.Item
							name="email"
							rules={[
								{ required: true, message: 'Email is required' },
								{ type: 'email', message: 'Enter a valid email' },
							]}
						>
							<Input
								placeholder="Email address"
								className="login-input"
								autoComplete="email"
							/>
						</Form.Item>

						<Form.Item
							name="password"
							rules={[{ required: true, message: 'Password is required' }]}
						>
							<Input.Password
								placeholder="Password"
								className="login-input"
								autoComplete="current-password"
							/>
						</Form.Item>

						<Form.Item style={{ marginBottom: 0 }}>
							<Button
								type="primary"
								htmlType="submit"
								className="login-btn"
								block
								loading={isLoading}
							>
								Sign In
							</Button>
						</Form.Item>
					</Form>

					<div className="login-or-divider">
						<span>OR</span>
					</div>

					<Button
						type="primary"
						icon={<ScanOutlined />}
						className="login-btn face-login-btn"
						block
						style={{ maxWidth: 280 }}
						onClick={() => setIsScanningFace(true)}
					>
						Sign In with Face ID
					</Button>

					<div className="login-nav">
						Don't have an account? <span 
						// onClick={onSwitchToSignup}
						>Sign Up</span>
					</div>

					<div className="login-divider" />
					<p className="login-footer">TraneAI — your intelligent coding assistant</p>
				</>
			)}
		</div>
	);
};

