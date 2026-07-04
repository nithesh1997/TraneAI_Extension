import React from 'react';
import { Form, Input, Button } from 'antd';
import { useAuth } from '../context/AuthContext';

interface SignupValues {
	email: string;
	password: string;
	confirm: string;
}

interface SignupPageProps {
	logoUri: string;
	onSwitchToLogin: () => void;
}

export const SignupPage: React.FC<SignupPageProps> = ({ logoUri, onSwitchToLogin }) => {
	const { signup, isLoading } = useAuth();
	const [form] = Form.useForm<SignupValues>();

	const handleFinish = (values: SignupValues) => {
		signup(values.email, values.password);
	};

	return (
		<div className="login-page">
			<div className="login-logo-wrap">
				<img src={logoUri} alt="TraneAI" />
			</div>
			<div className="login-title">
				Create <span>TraneAI</span> Account
			</div>
			<p className="login-subtitle">Sign up to get started</p>

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
						{ type: 'email', message: 'Enter a valid email' }
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
						autoComplete="new-password"
					/>
				</Form.Item>

				<Form.Item
					name="confirm"
					dependencies={['password']}
					rules={[
						{ required: true, message: 'Please confirm your password' },
						({ getFieldValue }) => ({
							validator(_, value) {
								if (!value || getFieldValue('password') === value) {
									return Promise.resolve();
								}
								return Promise.reject(new Error('Passwords do not match'));
							},
						}),
					]}
				>
					<Input.Password
						placeholder="Confirm password"
						className="login-input"
						autoComplete="new-password"
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
						Sign Up
					</Button>
				</Form.Item>
			</Form>

			<div className="login-nav">
				Already have an account? <span onClick={onSwitchToLogin}>Sign In</span>
			</div>

			<div className="login-divider" />
			<p className="login-footer">TraneAI — your intelligent coding assistant</p>
		</div>
	);
};
