import React, { createContext, useContext, useState, useCallback } from 'react';

interface AuthState {
	isAuthenticated: boolean;
	email: string | null;
}

interface AuthContextValue extends AuthState {
	login: (email: string, password: string) => void;
	signup: (email: string, password: string) => void;
	logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

declare const vscode: any;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [authState, setAuthState] = useState<AuthState>({
		isAuthenticated: false,
		email: null,
	});

	const login = useCallback((email: string, password: string) => {
		vscode.postMessage({ command: 'login', email, password });
		setAuthState({ isAuthenticated: true, email });
	}, []);

	const signup = useCallback((email: string, password: string) => {
		vscode.postMessage({ command: 'signup', email, password });
		setAuthState({ isAuthenticated: true, email });
	}, []);

	const logout = useCallback(() => {
		vscode.postMessage({ command: 'logout' });
		setAuthState({ isAuthenticated: false, email: null });
	}, []);

	return (
		<AuthContext.Provider value={{ ...authState, login, signup, logout }}>
			{children}
		</AuthContext.Provider>
	);
};

export const useAuth = (): AuthContextValue => {
	const ctx = useContext(AuthContext);
	if (!ctx) {
		throw new Error('useAuth must be used within AuthProvider');
	}
	return ctx;
};
