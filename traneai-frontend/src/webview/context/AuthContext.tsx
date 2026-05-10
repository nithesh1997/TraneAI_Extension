import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { secureStore, secureRetrieve, secureClear } from '../utils/storage';

const AUTH_STORAGE_KEY = 'traneai_auth';

interface AuthState {
	isAuthenticated: boolean;
	email: string | null;
}

interface StoredAuth {
	email: string;
	isAuthenticated: boolean;
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

	useEffect(() => {
		secureRetrieve<StoredAuth>(AUTH_STORAGE_KEY).then(stored => {
			if (stored?.isAuthenticated && stored?.email) {
				setAuthState({ isAuthenticated: true, email: stored.email });
				vscode.postMessage({ command: 'login', email: stored.email });
			}
		});
	}, []);

	const login = useCallback((email: string, password: string) => {
		vscode.postMessage({ command: 'login', email, password });
		setAuthState({ isAuthenticated: true, email });
		secureStore(AUTH_STORAGE_KEY, { email, isAuthenticated: true });
	}, []);

	const signup = useCallback((email: string, password: string) => {
		vscode.postMessage({ command: 'signup', email, password });
		setAuthState({ isAuthenticated: true, email });
		secureStore(AUTH_STORAGE_KEY, { email, isAuthenticated: true });
	}, []);

	const logout = useCallback(() => {
		vscode.postMessage({ command: 'logout' });
		setAuthState({ isAuthenticated: false, email: null });
		secureClear(AUTH_STORAGE_KEY);
	}, []);

	const value = useMemo(() => ({ ...authState, login, signup, logout }), [authState, login, signup, logout]);

	return (
		<AuthContext.Provider value={value}>
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
