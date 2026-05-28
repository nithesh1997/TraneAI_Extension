import React, { useState, useMemo, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import {
    ConfigProvider,
    theme as antdTheme,
    Input,
    Button,
    Badge,
    Segmented,
    Collapse,
    Tooltip,
    Empty,
    Checkbox,
    Space,
} from 'antd';
import {
    SearchOutlined,
    DeleteOutlined,
    CloseOutlined,
    CloseCircleFilled,
    WarningFilled,
    InfoCircleFilled,
    CheckCircleFilled,
    RightOutlined,
    PlayCircleOutlined,
} from '@ant-design/icons';

export enum LogLevel {
    Verbose = 'Verbose',
    Info = 'Info',
    Warning = 'Warning',
    Error = 'Error'
}

export enum LogSource {
    Runtime = 'runtime',
    Workspace = 'workspace'
}

export interface LogEntry {
    id: string;
    timestamp: number;
    source: LogSource;
    level: LogLevel;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    count: number;
}

interface ConsolePanelProps {
    logs: LogEntry[];
    onFix?: (log: LogEntry) => void;
    onClear?: () => void;
    onExecuteExpression?: (expression: string) => void;
    visible?: boolean;
    onClose?: () => void;
    filter?: string;
    onFilterChange?: (filter: string) => void;
    isLoading?: boolean;
    logoUri?: string;
}

const levelIcon = (level: LogLevel) => {
    switch (level) {
        case LogLevel.Error:
            return <CloseCircleFilled style={{ color: 'var(--danger)' }} />;
        case LogLevel.Warning:
            return <WarningFilled style={{ color: 'var(--warning)' }} />;
        case LogLevel.Info:
            return <CheckCircleFilled style={{ color: 'var(--success)' }} />;
        default:
            return <InfoCircleFilled style={{ color: 'var(--accent)' }} />;
    }
};

export const ConsolePanel: React.FC<ConsolePanelProps> = ({
    logs,
    onFix,
    onClear,
    onExecuteExpression,
    visible = true,
    onClose,
    filter: externalFilter,
    onFilterChange,
    isLoading = false,
    logoUri
}) => {
    const [internalFilter, setInternalFilter] = useState<string>('all');
    const filter = externalFilter !== undefined ? externalFilter : internalFilter;
    const setFilter = onFilterChange || setInternalFilter;
    const [search, setSearch] = useState('');
    const [expression, setExpression] = useState('');
    const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [mounted, setMounted] = useState(false);

    // Drag and Resize state
    const [dimensions, setDimensions] = useState({ width: 640, height: 440 });
    const [position, setPosition] = useState<{ x: number, y: number }>(() => ({
        x: window.innerWidth - 660,
        y: window.innerHeight - 520,
    }));

    useEffect(() => {
        const handleResize = () => {
            setPosition(prev => {
                const maxX = window.innerWidth - dimensions.width - 20;
                const maxY = window.innerHeight - dimensions.height - 20;
                return {
                    x: Math.min(prev.x, Math.max(0, maxX)),
                    y: Math.min(prev.y, Math.max(0, maxY)),
                };
            });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [dimensions]);

    useEffect(() => {
        if (visible) {
            const t = setTimeout(() => setMounted(true), 10);
            return () => clearTimeout(t);
        } else {
            setMounted(false);
        }
    }, [visible]);



    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const matchesSearch = log.message.toLowerCase().includes(search.toLowerCase()) ||
                (log.file && log.file.toLowerCase().includes(search.toLowerCase()));

            if (!matchesSearch) return false;

            if (filter === 'all') return true;
            if (filter === 'logs') return log.level === LogLevel.Verbose || (log.source === LogSource.Runtime && log.level === LogLevel.Info);
            if (filter === 'errors') return log.level === LogLevel.Error;
            if (filter === 'warnings') return log.level === LogLevel.Warning;
            if (filter === 'info') return log.source === LogSource.Workspace && log.level === LogLevel.Info;

            return true;
        });
    }, [logs, filter, search]);

    const errorCount = logs.filter(l => l.level === LogLevel.Error).length;
    const warningCount = logs.filter(l => l.level === LogLevel.Warning).length;
    const infoCount = logs.filter(l => l.source === LogSource.Workspace && l.level === LogLevel.Info).length;
    const logCount = logs.filter(l => l.level === LogLevel.Verbose || (l.source === LogSource.Runtime && l.level === LogLevel.Info)).length;

    if (!visible) return null;

    const formatTimestamp = (ts: number) => {
        const date = new Date(ts);
        return date.toLocaleTimeString('en-GB', { hour12: false });
    };

    const getDisplayPath = (fullPath?: string) => {
        if (!fullPath) return '';
        const parts = fullPath.split(/[\\/]/);
        const srcIndex = parts.findIndex(p => p.toLowerCase() === 'src');
        if (srcIndex !== -1) {
            return parts.slice(srcIndex).join('\\');
        }
        // If no src, try to show from project folder (usually after 'workspace')
        const workspaceIndex = parts.findIndex(p => p.toLowerCase() === 'workspace');
        if (workspaceIndex !== -1 && workspaceIndex < parts.length - 1) {
            return parts.slice(workspaceIndex + 1).join('\\');
        }
        // Fallback to last 2 segments if path is long
        return parts.length > 2 ? parts.slice(-2).join('\\') : fullPath;
    };

    const handleRunExpression = () => {
        if (expression.trim() && onExecuteExpression) {
            onExecuteExpression(expression);
            setExpression('');
        }
    };

    const toggleCheck = (id: string) => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const filterOptions = [
        {
            label: (
                <span className="filter-option">
                    All <Badge count={logs.length} overflowCount={999} showZero color="var(--text-muted)" />
                </span>
            ),
            value: 'all'
        },
        {
            label: (
                <span className="filter-option">
                    Logs <Badge count={logCount} overflowCount={999} showZero color="var(--text-secondary)" />
                </span>
            ),
            value: 'logs'
        },
        {
            label: (
                <span className="filter-option">
                    Warnings <Badge count={warningCount} overflowCount={999} showZero color="var(--warning)" />
                </span>
            ),
            value: 'warnings'
        },
        {
            label: (
                <span className="filter-option">
                    Errors <Badge count={errorCount} overflowCount={999} showZero color="var(--danger)" />
                </span>
            ),
            value: 'errors'
        },
        {
            label: (
                <span className="filter-option">
                    Info <Badge count={infoCount} overflowCount={999} showZero color="var(--accent)" />
                </span>
            ),
            value: 'info'
        },
    ];

    return (
        <ConfigProvider
            theme={{
                algorithm: antdTheme.darkAlgorithm,
                token: {
                    colorPrimary: 'var(--accent)',
                    colorSuccess: 'var(--success)',
                    colorWarning: 'var(--warning)',
                    colorError: 'var(--danger)',
                    colorInfo: 'var(--accent)',
                    borderRadius: 6,
                    fontSize: 12,
                    colorBgContainer: 'var(--bg-secondary)',
                    colorBgElevated: 'var(--bg-tertiary)',
                    colorBorder: 'var(--border)',
                    colorText: 'var(--text-primary)',
                    colorTextDescription: 'var(--text-secondary)',
                },
                components: {
                    Segmented: {
                        itemSelectedBg: 'var(--bg-tertiary)',
                        itemSelectedColor: 'var(--text-primary)',
                        trackBg: 'var(--bg-primary)',
                    },
                    Collapse: {
                        headerPadding: 0,
                        contentPadding: 0,
                    },
                    Input: {
                        colorBgContainer: 'var(--bg-input)',
                    }
                }
            }}
        >
            <Rnd
                className={`console-modal-overlay ${isLoading ? 'loading' : ''} ${mounted ? 'mounted' : ''}`}
                size={{ width: dimensions.width, height: dimensions.height }}
                position={position}
                onDragStop={(e, d) => {
                    setPosition({ x: d.x, y: d.y });
                }}
                onResizeStop={(e, direction, ref, delta, pos) => {
                    setDimensions({
                        width: parseInt(ref.style.width),
                        height: parseInt(ref.style.height),
                    });
                    setPosition(pos);
                }}
                dragHandleClassName="console-title-bar"
                cancel=".console-no-drag"
                minWidth={400}
                minHeight={240}
                bounds="window"
                enableResizing={{
                    top: true,
                    right: false,
                    bottom: false,
                    left: true,
                    topRight: false,
                    bottomRight: false,
                    bottomLeft: false,
                    topLeft: true,
                }}
            >
                <div className="console-container">
                    <div className="console-title-bar">
                        <div className="console-title">
                            {logoUri && <img src={logoUri} className="console-logo" alt="TraneAI" />}
                            <span>CONSOLE</span>
                        </div>
                        <Tooltip title="Close" placement="left">
                            <Button
                                className="console-no-drag"
                                type="text"
                                size="small"
                                shape="circle"
                                icon={<CloseOutlined />}
                                onClick={onClose}
                            />
                        </Tooltip>
                    </div>

                    <div className="console-no-drag">
                        <Input
                            allowClear
                            size="middle"
                            placeholder="Filter logs..."
                            prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="console-toolbar console-no-drag">
                        <Segmented
                            size="small"
                            value={filter}
                            onChange={(v) => setFilter(v as string)}
                            options={filterOptions}
                        />
                        <Tooltip title="Clear all logs">
                            <Button
                                size="small"
                                icon={<DeleteOutlined />}
                                onClick={onClear}
                            >
                                Clear
                            </Button>
                        </Tooltip>
                    </div>

                    <div className="console-list console-no-drag">
                        {filteredLogs.length === 0 ? (
                            <div className="console-empty">
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={<span style={{ color: 'var(--text-muted)' }}>No logs to display</span>}
                                />
                            </div>
                        ) : (
                            <Collapse
                                ghost
                                activeKey={expandedKeys}
                                onChange={(keys) => setExpandedKeys(Array.isArray(keys) ? keys : [keys])}
                                expandIcon={({ isActive }) => (
                                    <RightOutlined
                                        rotate={isActive ? 90 : 0}
                                        style={{ color: 'var(--text-muted)', fontSize: 10, transition: 'transform 0.2s' }}
                                    />
                                )}
                                items={filteredLogs.map(log => ({
                                    key: log.id,
                                    label: (
                                        <div className={`log-row level-${log.level.toLowerCase()}`}>
                                            <Checkbox
                                                checked={checkedIds.has(log.id)}
                                                onClick={(e) => { e.stopPropagation(); toggleCheck(log.id); }}
                                                onChange={() => { }}
                                            />
                                            <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
                                            <span className="log-icon">{levelIcon(log.level)}</span>
                                            <Tooltip
                                                title={
                                                    <div style={{ padding: '6px 4px' }}>
                                                        <div style={{ marginBottom: log.file ? 10 : 0, fontWeight: 500, lineHeight: 1.4 }}>{log.message}</div>
                                                        {log.file && (
                                                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 8 }}>
                                                                <div style={{ color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, fontWeight: 600 }}>Location</div>
                                                                <div style={{ 
                                                                    fontFamily: 'var(--font-mono)', 
                                                                    fontSize: '11px', 
                                                                    color: 'var(--accent)',
                                                                    backgroundColor: 'rgba(0,0,0,0.2)',
                                                                    padding: '4px 6px',
                                                                    borderRadius: '4px',
                                                                    wordBreak: 'break-all',
                                                                    lineHeight: 1.5
                                                                }}>
                                                                    {getDisplayPath(log.file)}:{log.line}{log.column ? `:${log.column}` : ''}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                }
                                                placement="topLeft"
                                                mouseEnterDelay={0.3}
                                            >
                                                <span className="log-message">
                                                    {log.message}
                                                    {log.count > 1 && (
                                                        <Badge
                                                            count={log.count}
                                                            size="small"
                                                            color="var(--text-muted)"
                                                            style={{ marginLeft: 8 }}
                                                        />
                                                    )}
                                                </span>
                                            </Tooltip>
                                            {log.file && (
                                                <Tooltip title={`${getDisplayPath(log.file)}:${log.line}`} placement="left">
                                                    <span className="log-location">
                                                        {`${log.file.split(/[\\/]/).pop()}:${log.line}`}
                                                    </span>
                                                </Tooltip>
                                            )}
                                        </div>
                                    ),
                                    children: (
                                        <div className="log-details-box">
                                            <div className="details-header">Full message:</div>
                                            <div className="details-body">
                                                {log.message}
                                                {log.file && `\n\nLocation: ${log.file}:${log.line}:${log.column}`}
                                            </div>
                                            {onFix && (log.level === LogLevel.Error || log.level === LogLevel.Warning) && (
                                                <Button
                                                    type="primary"
                                                    ghost
                                                    size="small"
                                                    style={{ marginTop: 12 }}
                                                    onClick={(e) => { e.stopPropagation(); onFix(log); }}
                                                >
                                                    Fix issue ↗
                                                </Button>
                                            )}
                                        </div>
                                    )
                                }))}
                            />
                        )}
                    </div>

                    <div className="console-expression-input console-no-drag">
                        <Space.Compact style={{ width: '100%' }}>
                            <Input
                                prefix={<span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>&gt;</span>}
                                placeholder="Enter expression..."
                                value={expression}
                                onChange={(e) => setExpression(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRunExpression()}
                            />
                            <Button
                                type="primary"
                                icon={<PlayCircleOutlined />}
                                onClick={handleRunExpression}
                            >
                                Run
                            </Button>
                        </Space.Compact>
                    </div>

                    <div className="console-status-footer">
                        <span className="status-item error">
                            <CloseCircleFilled /> {errorCount} error
                        </span>
                        <span className="status-item warning">
                            <WarningFilled /> {warningCount} warnings
                        </span>
                        <span className="status-item info">
                            <CheckCircleFilled /> {infoCount} info
                        </span>
                        <span className="status-item logs">
                            <InfoCircleFilled /> {logCount} logs
                        </span>
                    </div>
                </div>
            </Rnd>
        </ConfigProvider>
    );
};
