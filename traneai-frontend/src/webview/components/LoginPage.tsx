import React from 'react';
import { Form, Input, Button } from 'antd';
import { useAuth } from '../context/AuthContext';

interface LoginValues {
	email: string;
	password: string;
}

interface LoginPageProps {
	logoUri: string;
	onSwitchToSignup: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ logoUri, onSwitchToSignup }) => {
	const { login } = useAuth();
	const [form] = Form.useForm<LoginValues>();

	const handleFinish = (values: LoginValues) => {
		login(values.email, values.password);
	};

	return (
		<div className="login-page">
			<div className="login-logo-wrap">
				<img src={logoUri} alt="TraneAI" />
			</div>
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
					>
						Sign In
					</Button>
				</Form.Item>
			</Form>

			<div className="login-nav">
				Don't have an account? <span onClick={onSwitchToSignup}>Sign Up</span>
			</div>

			<div className="login-divider" />
			<p className="login-footer">TraneAI — your intelligent coding assistant</p>
		</div>
	);
};
