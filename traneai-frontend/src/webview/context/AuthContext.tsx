import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { secureStore, secureRetrieve, secureClear } from '../utils/storage';
import { message } from 'antd';

const AUTH_STORAGE_KEY = 'traneai_auth';

interface AuthState {
	isAuthenticated: boolean;
	email: string | null;
    isLoading: boolean;
    error: string | null;
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
        isLoading: false,
        error: null
	});

	useEffect(() => {
		secureRetrieve<StoredAuth>(AUTH_STORAGE_KEY).then(stored => {
			if (stored?.isAuthenticated && stored?.email) {
				setAuthState(prev => ({ ...prev, isAuthenticated: true, email: stored.email }));
				vscode.postMessage({ command: 'login', email: stored.email }); // Sync with extension host
			}
		});
	}, []);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const data = event.data;
            if (data.type === 'authLoading') {
                setAuthState(prev => ({ ...prev, isLoading: data.value, error: null }));
            } else if (data.type === 'authResult') {
                if (data.success) {
                    setAuthState(prev => ({
                        ...prev,
                        isAuthenticated: true,
                        email: data.email,
                        isLoading: false,
                        error: null
                    }));
                    secureStore(AUTH_STORAGE_KEY, { email: data.email, isAuthenticated: true, token: data.token });
                } else {
                    setAuthState(prev => ({ ...prev, isLoading: false, error: data.error }));
                    message.error(data.error || 'Authentication failed');
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

	const login = useCallback((email: string, password: string) => {
		vscode.postMessage({ command: 'login', email, password });
	}, []);

	const signup = useCallback((email: string, password: string) => {
		vscode.postMessage({ command: 'signup', email, password });
	}, []);

	const logout = useCallback(() => {
		vscode.postMessage({ command: 'logout' });
		setAuthState({ isAuthenticated: false, email: null, isLoading: false, error: null });
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
