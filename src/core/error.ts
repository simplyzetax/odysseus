import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

// Enhanced types for better type safety
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorCategory = 'authentication' | 'authorization' | 'validation' | 'business' | 'system' | 'network' | 'external';
export type HttpStatusCode = 200 | 201 | 400 | 401 | 403 | 404 | 405 | 406 | 408 | 409 | 413 | 415 | 429 | 500 | 501;

export interface ErrorContext {
    requestId?: string;
    userId?: string;
    sessionId?: string;
    userAgent?: string;
    ip?: string;
    path?: string;
    method?: string;
    timestamp: string;
    stack?: string;
    cause?: Error | ApiError;
    breadcrumbs?: string[];
    metadata?: Record<string, any>;
    performance?: {
        duration?: number;
        memory?: number;
    };
}

export interface ResponseBody {
    errorCode: string;
    errorMessage: string;
    messageVars?: string[];
    numericErrorCode: number;
    originatingService: string;
    intent: string;
    validationFailures?: Record<string, object>;
    // Enhanced fields
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    fingerprint?: string;
    correlationId?: string;
    timestamp?: string;
    retryable?: boolean;
    context?: Partial<ErrorContext>;
    suggestions?: string[];
    documentation?: string;
    // Development only fields
    devInfo?: {
        stack?: string;
        cause?: any;
        sourceLocation?: string;
        debugData?: Record<string, any>;
    };
}

export class ApiError {
    statusCode: HttpStatusCode;
    public response: ResponseBody;
    private _context: ErrorContext;
    private _fingerprint?: string;
    private _stack?: string;

    constructor(
        code: string,
        message: string,
        numeric: number,
        statusCode: HttpStatusCode,
        ...messageVariables: string[]
    ) {
        this.statusCode = statusCode;
        this._stack = new Error().stack;
        this._context = {
            timestamp: new Date().toISOString(),
            breadcrumbs: [],
            metadata: {}
        };

        this.response = {
            errorCode: code,
            errorMessage: message,
            messageVars: messageVariables.length > 0 ? messageVariables : undefined,
            numericErrorCode: numeric,
            originatingService: 'odysseus',
            intent: 'unknown',
            severity: this._inferSeverity(statusCode),
            category: this._inferCategory(code),
            fingerprint: this._generateFingerprint(code, numeric),
            correlationId: this._generateCorrelationId(),
            timestamp: this._context.timestamp,
            retryable: this._isRetryable(statusCode)
        };
    }

    // Enhanced fluent API methods
    withMessage(message: string): this {
        this.response.errorMessage = message;
        this._updateFingerprint();
        return this;
    }

    variable(variables: string[]): this {
        const replacables = this.response.errorMessage.match(/{\d}/g)?.map((match) => match.replaceAll(/[{}]/g, ''));

        if (!replacables) return this;

        for (const placeholderIndex of replacables) {
            const variable = variables[Number.parseInt(placeholderIndex)];
            if (variable) {
                this.response.errorMessage = this.response.errorMessage.replace(`{${placeholderIndex}}`, variable);
            }
        }

        return this;
    }

    originatingService(service: string): this {
        this.response.originatingService = service;
        this._updateFingerprint();
        return this;
    }

    with(...messageVariables: string[]): this {
        this.response.messageVars = this.response.messageVars?.concat(messageVariables) || messageVariables;
        return this;
    }

    // New enhanced methods
    withSeverity(severity: ErrorSeverity): this {
        this.response.severity = severity;
        return this;
    }

    withCategory(category: ErrorCategory): this {
        this.response.category = category;
        this._updateFingerprint();
        return this;
    }

    withContext(context: Partial<ErrorContext>): this {
        this._context = { ...this._context, ...context };
        this.response.context = this._sanitizeContext(this._context);
        return this;
    }

    withCause(cause: Error | ApiError): this {
        this._context.cause = cause;
        if (cause instanceof Error) {
            this._context.stack = cause.stack;
        }
        return this;
    }

    withMetadata(key: string, value: any): this {
        if (!this._context.metadata) this._context.metadata = {};
        this._context.metadata[key] = value;
        return this;
    }

    withBreadcrumb(breadcrumb: string): this {
        if (!this._context.breadcrumbs) this._context.breadcrumbs = [];
        this._context.breadcrumbs.push(`${new Date().toISOString()}: ${breadcrumb}`);
        if (this._context.breadcrumbs.length > 10) {
            this._context.breadcrumbs = this._context.breadcrumbs.slice(-10);
        }
        return this;
    }

    withSuggestion(...suggestions: string[]): this {
        this.response.suggestions = [...(this.response.suggestions || []), ...suggestions];
        return this;
    }

    withDocumentation(url: string): this {
        this.response.documentation = url;
        return this;
    }

    retryable(isRetryable: boolean = true): this {
        this.response.retryable = isRetryable;
        return this;
    }

    withValidationFailures(failures: Record<string, object>): this {
        this.response.validationFailures = failures;
        return this;
    }

    // Performance tracking
    startTimer(): this {
        this._context.performance = {
            ...this._context.performance,
            duration: Date.now()
        };
        return this;
    }

    endTimer(): this {
        if (this._context.performance?.duration) {
            this._context.performance.duration = Date.now() - this._context.performance.duration;
        }
        return this;
    }

    // Enhanced apply method with better context handling
    apply(c: Context): ResponseBody {
        this._enrichContextFromRequest(c);
        this.response.errorMessage = this.getMessage();

        // Set enhanced headers
        c.res.headers.set('Content-Type', 'application/json');
        c.res.headers.set('X-Epic-Error-Code', `${this.response.numericErrorCode}`);
        c.res.headers.set('X-Epic-Error-Name', this.response.errorCode);
        c.res.headers.set('X-Error-Correlation-ID', this.response.correlationId || '');
        c.res.headers.set('X-Error-Fingerprint', this.response.fingerprint || '');

        if (this.response.retryable) {
            c.res.headers.set('X-Error-Retryable', 'true');
        }

        c.status(this.statusCode as any);

        // Log the error for observability
        this._logError();

        return this.response;
    }

    getMessage(): string {
        return this.response.messageVars?.reduce(
            (message, msgVar, index) => message.replace(`{${index}}`, msgVar),
            this.response.errorMessage
        ) || this.response.errorMessage;
    }

    shortenedError(): string {
        return `${this.response.errorCode} - ${this.response.errorMessage}`;
    }

    throwHttpException(): never {
        this._logError();

        const errorResponse = new Response(JSON.stringify(this.response), {
            status: this.statusCode,
            headers: {
                'Content-Type': 'application/json',
                'X-Epic-Error-Code': `${this.response.numericErrorCode}`,
                'X-Epic-Error-Name': this.response.errorCode,
                'X-Error-Correlation-ID': this.response.correlationId || '',
                'X-Error-Fingerprint': this.response.fingerprint || ''
            }
        });
        throw new HTTPException(this.statusCode as any, { res: errorResponse });
    }

    devMessage(message: string, devMode: string | undefined): this {
        if (devMode !== 'true') return this;

        if (!this.response.devInfo) {
            this.response.devInfo = {};
        }

        this.response.devInfo.debugData = {
            ...this.response.devInfo.debugData,
            devMessage: message
        };

        this.response.errorMessage += ` (Dev: ${message})`;
        return this;
    }

    // Enhanced development features
    withDevInfo(devMode: string | undefined): this {
        if (devMode !== 'true') return this;

        this.response.devInfo = {
            stack: this._stack,
            cause: this._context.cause,
            sourceLocation: this._getSourceLocation(),
            debugData: {
                context: this._context,
                metadata: this._context.metadata
            }
        };

        return this;
    }

    // Utility methods for error analysis
    toJSON(): Record<string, any> {
        return {
            ...this.response,
            context: this._context,
            stack: this._stack
        };
    }

    toString(): string {
        return `[${this.response.severity?.toUpperCase()}] ${this.response.errorCode}: ${this.getMessage()}`;
    }

    // Private helper methods
    private _inferSeverity(statusCode: HttpStatusCode): ErrorSeverity {
        if (statusCode >= 500) return 'critical';
        if (statusCode === 429) return 'medium';
        if (statusCode >= 400) return 'medium';
        return 'low';
    }

    private _inferCategory(code: string): ErrorCategory {
        const lowerCode = code.toLowerCase();
        if (lowerCode.includes('auth')) return 'authentication';
        if (lowerCode.includes('permission') || lowerCode.includes('forbidden')) return 'authorization';
        if (lowerCode.includes('validation') || lowerCode.includes('invalid')) return 'validation';
        if (lowerCode.includes('network') || lowerCode.includes('timeout')) return 'network';
        if (lowerCode.includes('external') || lowerCode.includes('proxy')) return 'external';
        if (lowerCode.includes('server') || lowerCode.includes('database')) return 'system';
        return 'business';
    }

    private _generateFingerprint(code: string, numeric: number): string {
        return `${code}-${numeric}`.replace(/\./g, '-');
    }

    private _updateFingerprint(): void {
        this.response.fingerprint = this._generateFingerprint(
            this.response.errorCode,
            this.response.numericErrorCode
        );
    }

    private _generateCorrelationId(): string {
        return `err_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    private _isRetryable(statusCode: HttpStatusCode): boolean {
        return [408, 429, 500, 502, 503, 504].includes(statusCode);
    }

    private _sanitizeContext(context: ErrorContext): Partial<ErrorContext> {
        const sanitized = { ...context };
        // Remove sensitive information
        delete sanitized.stack;
        delete sanitized.cause;
        return sanitized;
    }

    private _enrichContextFromRequest(c: Context): void {
        this._context = {
            ...this._context,
            requestId: c.req.header('x-request-id'),
            userId: c.req.header('x-user-id'),
            sessionId: c.req.header('x-session-id'),
            userAgent: c.req.header('user-agent'),
            ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
            path: c.req.path,
            method: c.req.method
        };

        this.response.context = this._sanitizeContext(this._context);
    }

    private _getSourceLocation(): string {
        const stack = this._stack;
        if (!stack) return 'unknown';

        const lines = stack.split('\n');
        const relevantLine = lines.find(line =>
            line.includes('.ts:') &&
            !line.includes('node_modules') &&
            !line.includes('error.ts')
        );

        return relevantLine?.trim() || 'unknown';
    }

    private _logError(): void {
        const logData = {
            errorCode: this.response.errorCode,
            numericCode: this.response.numericErrorCode,
            severity: this.response.severity,
            category: this.response.category,
            fingerprint: this.response.fingerprint,
            correlationId: this.response.correlationId,
            statusCode: this.statusCode,
            message: this.getMessage(),
            context: this._context,
            timestamp: this.response.timestamp
        };

        // In a real implementation, you'd send this to your logging service
        if (this.response.severity === 'critical' || this.response.severity === 'high') {
            console.error('🚨 Critical Error:', logData);
        } else {
            console.warn('⚠️  Error:', logData);
        }
    }
}

// Utility types for Result pattern
export type Result<T, E = ApiError> =
    | { success: true; data: T; error?: never }
    | { success: false; error: E; data?: never };

export type AsyncResult<T, E = ApiError> = Promise<Result<T, E>>;

// Error handling utilities
export class ErrorUtils {
    // Result pattern helpers
    static ok<T>(data: T): Result<T> {
        return { success: true, data };
    }

    static err<E = ApiError>(error: E): Result<never, E> {
        return { success: false, error };
    }

    // Safe async execution with error handling
    static async safeAsync<T>(
        fn: () => Promise<T>,
        errorHandler?: (error: unknown) => ApiError
    ): AsyncResult<T> {
        try {
            const data = await fn();
            return this.ok(data);
        } catch (error) {
            const apiError = errorHandler ? errorHandler(error) : this.fromUnknown(error);
            return this.err(apiError);
        }
    }

    // Safe sync execution with error handling
    static safe<T>(
        fn: () => T,
        errorHandler?: (error: unknown) => ApiError
    ): Result<T> {
        try {
            const data = fn();
            return this.ok(data);
        } catch (error) {
            const apiError = errorHandler ? errorHandler(error) : this.fromUnknown(error);
            return this.err(apiError);
        }
    }

    // Convert unknown errors to ApiError
    static fromUnknown(error: unknown): ApiError {
        if (error instanceof ApiError) {
            return error;
        }

        if (error instanceof Error) {
            return odysseus.internal.unknownError
                .withMessage(error.message)
                .withCause(error);
        }

        return odysseus.internal.unknownError
            .withMessage(String(error));
    }

    // Aggregate multiple errors
    static aggregate(errors: ApiError[], message = 'Multiple errors occurred'): ApiError {
        if (errors.length === 0) {
            return odysseus.internal.unknownError.withMessage('No errors to aggregate');
        }

        if (errors.length === 1) {
            return errors[0];
        }

        const aggregatedError = odysseus.internal.serverError
            .withMessage(`${message} (${errors.length} errors)`)
            .withSeverity('high');

        errors.forEach((error, index) => {
            aggregatedError.withBreadcrumb(`Error ${index + 1}: ${error.shortenedError()}`);
        });

        return aggregatedError;
    }

    // Retry logic with exponential backoff
    static async withRetry<T>(
        fn: () => Promise<T>,
        options: {
            maxAttempts?: number;
            baseDelay?: number;
            maxDelay?: number;
            shouldRetry?: (error: unknown) => boolean;
        } = {}
    ): AsyncResult<T> {
        const {
            maxAttempts = 3,
            baseDelay = 1000,
            maxDelay = 10000,
            shouldRetry = (error) => error instanceof ApiError && (error.response.retryable ?? false)
        } = options;

        let lastError: unknown;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await fn();
                return this.ok(result);
            } catch (error) {
                lastError = error;

                if (attempt === maxAttempts || !shouldRetry(error)) {
                    break;
                }

                const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        const apiError = this.fromUnknown(lastError)
            .withBreadcrumb(`Failed after ${maxAttempts} attempts`);

        return this.err(apiError);
    }

    // Timeout wrapper
    static async withTimeout<T>(
        fn: () => Promise<T>,
        timeoutMs: number,
        timeoutError?: ApiError
    ): AsyncResult<T> {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(timeoutError || odysseus.internal.requestTimedOut);
            }, timeoutMs);
        });

        try {
            const result = await Promise.race([fn(), timeoutPromise]);
            return this.ok(result);
        } catch (error) {
            return this.err(this.fromUnknown(error));
        }
    }
}

// Error boundary for catching and handling errors
export class ErrorBoundary {
    private static instance: ErrorBoundary;
    private handlers: Map<string, (error: ApiError) => void> = new Map();
    private metrics: Map<string, number> = new Map();

    static getInstance(): ErrorBoundary {
        if (!this.instance) {
            this.instance = new ErrorBoundary();
        }
        return this.instance;
    }

    // Register error handlers
    onError(pattern: string, handler: (error: ApiError) => void): void {
        this.handlers.set(pattern, handler);
    }

    // Handle error with registered handlers
    handle(error: ApiError): void {
        // Update metrics
        const fingerprint = error.response.fingerprint || 'unknown';
        this.metrics.set(fingerprint, (this.metrics.get(fingerprint) || 0) + 1);

        // Find and execute matching handlers
        for (const [pattern, handler] of this.handlers) {
            if (error.response.errorCode.includes(pattern) ||
                error.response.category === pattern ||
                error.response.severity === pattern) {
                try {
                    handler(error);
                } catch (handlerError) {
                    console.error('Error handler failed:', handlerError);
                }
            }
        }
    }

    // Get error metrics
    getMetrics(): Record<string, number> {
        return Object.fromEntries(this.metrics);
    }

    // Reset metrics
    resetMetrics(): void {
        this.metrics.clear();
    }
}

// Middleware factory for automatic error handling
export function createErrorMiddleware(options: {
    enableDevMode?: boolean;
    enableMetrics?: boolean;
    customHandler?: (error: ApiError, c: Context) => Response | Promise<Response>;
} = {}) {
    const { enableDevMode = false, enableMetrics = true, customHandler } = options;

    return async (c: Context, next: () => Promise<void>) => {
        try {
            await next();
        } catch (error) {
            const apiError = ErrorUtils.fromUnknown(error)
                .withContext({
                    requestId: c.req.header('x-request-id'),
                    path: c.req.path,
                    method: c.req.method,
                    userAgent: c.req.header('user-agent')
                });

            if (enableDevMode) {
                apiError.withDevInfo('true');
            }

            if (enableMetrics) {
                ErrorBoundary.getInstance().handle(apiError);
            }

            if (customHandler) {
                const response = await customHandler(apiError, c);
                return response;
            }

            return new Response(JSON.stringify(apiError.apply(c)), {
                status: apiError.statusCode,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }
    };
}

// Error factory with enhanced methods
export class ErrorFactory {
    // Create error with automatic categorization
    static create(
        code: string,
        message: string,
        numeric: number,
        statusCode: number,
        options: {
            category?: ErrorCategory;
            severity?: ErrorSeverity;
            suggestions?: string[];
            retryable?: boolean;
            documentation?: string;
        } = {}
    ): ApiError {
        return new ApiError(code, message, numeric, statusCode as HttpStatusCode)
            .withCategory(options.category || 'business')
            .withSeverity(options.severity || 'medium')
            .withSuggestion(...(options.suggestions || []))
            .retryable(options.retryable ?? false)
            .withDocumentation(options.documentation || '');
    }

    // Validation error helper
    static validation(
        field: string,
        value: any,
        rule: string,
        suggestions: string[] = []
    ): ApiError {
        return this.create(
            `errors.com.odysseus.validation.${field}`,
            `Validation failed for field '${field}': ${rule}`,
            1040,
            400,
            {
                category: 'validation',
                severity: 'medium',
                suggestions: [
                    `Check the '${field}' field format`,
                    `Ensure '${field}' meets the requirements: ${rule}`,
                    ...suggestions
                ]
            }
        ).withValidationFailures({ [field]: { value, rule } });
    }

    // Rate limit error helper
    static rateLimit(
        limit: number,
        windowMs: number,
        retryAfterMs: number
    ): ApiError {
        return this.create(
            'errors.com.odysseus.rateLimit.exceeded',
            `Rate limit exceeded: ${limit} requests per ${windowMs}ms`,
            1041,
            429,
            {
                category: 'system',
                severity: 'medium',
                retryable: true,
                suggestions: [
                    `Wait ${Math.ceil(retryAfterMs / 1000)} seconds before retrying`,
                    'Consider implementing exponential backoff',
                    'Check if you can batch your requests'
                ]
            }
        ).withMetadata('retryAfterMs', retryAfterMs);
    }

    // External service error helper
    static external(
        service: string,
        operation: string,
        cause?: Error
    ): ApiError {
        return this.create(
            `errors.com.odysseus.external.${service}`,
            `External service '${service}' failed during '${operation}'`,
            2000,
            502,
            {
                category: 'external',
                severity: 'high',
                retryable: true,
                suggestions: [
                    `Check ${service} service status`,
                    'Retry the operation with exponential backoff',
                    'Verify network connectivity'
                ]
            }
        ).withCause(cause || new Error(`${service} service error`));
    }
}

// Performance monitoring for errors
export class ErrorPerformanceMonitor {
    private static metrics = new Map<string, {
        count: number;
        avgDuration: number;
        totalDuration: number;
    }>();

    static track(error: ApiError): void {
        const fingerprint = error.response.fingerprint || 'unknown';
        const duration = error.response.context?.performance?.duration || 0;

        const existing = this.metrics.get(fingerprint) || { count: 0, avgDuration: 0, totalDuration: 0 };
        existing.count++;
        existing.totalDuration += duration;
        existing.avgDuration = existing.totalDuration / existing.count;

        this.metrics.set(fingerprint, existing);
    }

    static getMetrics(): Record<string, any> {
        return Object.fromEntries(this.metrics);
    }

    static reset(): void {
        this.metrics.clear();
    }
}

export const odysseus = {
    proxy: {
        get fetchError() {
            return new ApiError('errors.com.odysseus.proxy.fetchError', 'An error occurred while fetching data from {0}', 1000, 500);
        },
        get noResponseDetails() {
            return new ApiError('errors.com.odysseus.proxy.noResponseDetails', 'No response details were found', 1000, 500);
        },
        get invalidMethod() {
            return new ApiError('errors.com.odysseus.proxy.invalidMethod', 'Invalid method', 1000, 500);
        },
        get invalidBody() {
            return new ApiError('errors.com.odysseus.proxy.invalidBody', 'Invalid body', 1000, 500);
        },
        get invalidQuery() {
            return new ApiError('errors.com.odysseus.proxy.invalidQuery', 'Invalid query', 1000, 500);
        },
        get invalidHeader() {
            return new ApiError('errors.com.odysseus.proxy.invalidHeader', 'Invalid header', 1000, 500);
        },
        get invalidUrl() {
            return new ApiError('errors.com.odysseus.proxy.invalidUrl', 'Invalid url', 1000, 500);
        },
        get invalidStatus() {
            return new ApiError('errors.com.odysseus.proxy.invalidStatus', 'Invalid status', 1000, 500);
        },
    },
    authentication: {
        get invalidHeader() {
            return new ApiError('errors.com.odysseus.authentication.invalidHeader', 'It looks like your authorization header is invalid or missing, please verify that you are sending the correct headers.', 1011, 401);
        },
        get invalidRequest() {
            return new ApiError('errors.com.odysseus.authentication.invalidRequest', 'The request body you provided is either invalid or missing elements.', 1013, 400);
        },
        get invalidToken() {
            return new ApiError('errors.com.odysseus.authentication.invalidToken', 'Invalid token {0}', 1014, 401);
        },
        get wrongGrantType() {
            return new ApiError('errors.com.odysseus.authentication.wrongGrantType', 'Sorry, your client does not have the proper grant_type for access.', 1016, 400);
        },
        get notYourAccount() {
            return new ApiError('errors.com.odysseus.authentication.notYourAccount', "You are not allowed to make changes to other people's accounts", 1023, 403);
        },
        get validationFailed() {
            return new ApiError('errors.com.odysseus.authentication.validationFailed', "Sorry we couldn't validate your token {0}. Please try with a new token.", 1031, 401);
        },
        get authenticationFailed() {
            return new ApiError('errors.com.odysseus.authentication.authenticationFailed', 'Authentication failed for {0}', 1032, 401);
        },
        get notOwnSessionRemoval() {
            return new ApiError('errors.com.odysseus.authentication.notOwnSessionRemoval', 'Sorry you cannot remove the auth session {0}. It was not issued to you.', 18040, 403);
        },
        get unknownSession() {
            return new ApiError('errors.com.odysseus.authentication.unknownSession', 'Sorry we could not find the auth session {0}', 18051, 404);
        },
        get usedClientToken() {
            return new ApiError('errors.com.odysseus.authentication.wrongTokenType', 'This route requires quthentication via user access tokens, but you are using a client token', 18052, 401);
        },
        oauth: {
            get invalidBody() {
                return new ApiError('errors.com.odysseus.authentication.oauth.invalidBody', 'The request body you provided is either invalid or missing elements.', 1013, 400);
            },
            get invalidExternalAuthType() {
                return new ApiError('errors.com.odysseus.authentication.oauth.invalidExternalAuthType', 'The external auth type {0} you used is not supported by the server.', 1016, 400);
            },
            get grantNotImplemented() {
                return new ApiError('errors.com.odysseus.authentication.grantNotImplemented', 'The grant_type {0} you used is not supported by the server.', 1016, 501);
            },
            get tooManySessions() {
                return new ApiError('errors.com.odysseus.authentication.oauth.tooManySessions', 'Sorry too many sessions have been issued for your account. Please try again later', 18048, 400);
            },
            get invalidAccountCredentials() {
                return new ApiError('errors.com.odysseus.authentication.oauth.invalidAccountCredentials', 'Sorry the account credentials you are using are invalid', 18031, 400);
            },
            get invalidRefresh() {
                return new ApiError('errors.com.odysseus.authentication.oauth.invalidRefresh', 'The refresh token you provided is invalid.', 18036, 400);
            },
            get invalidClient() {
                return new ApiError('errors.com.odysseus.authentication.oauth.invalidClient', 'The client credentials you are using are invalid.', 18033, 403);
            },
            get invalidExchange() {
                return new ApiError('errors.com.odysseus.authentication.oauth.invalidExchange', 'The exchange code {0} is invalid.', 18057, 400);
            },
            get expiredExchangeCodeSession() {
                return new ApiError('errors.com.odysseus.authentication.oauth.expiredExchangeCodeSession', 'Sorry the originating session for the exchange code has expired.', 18128, 400);
            },
            get correctiveActionRequired() {
                return new ApiError('errors.com.odysseus.authentication.oauth.corrective_action_required', 'Corrective action is required to continue.', 18206, 400);
            }
        }
    },
    party: {
        get partyNotFound() {
            return new ApiError('errors.com.odysseus.party.partyNotFound', 'Party {0} does not exist.', 51002, 404);
        },
        get memberNotFound() {
            return new ApiError('errors.com.odysseus.party.memberNotFound', 'Party member {0} does not exist.', 51004, 404);
        },
        get alreadyInParty() {
            return new ApiError('errors.com.odysseus.party.alreadyInParty', 'Your already in a party.', 51012, 409);
        },
        get userHasNoParty() {
            return new ApiError('errors.com.odysseus.party.userHasNoParty', 'User {0} has no party to join.', 51019, 404);
        },
        get notLeader() {
            return new ApiError('errors.com.odysseus.party.notLeader', 'You are not the party leader.', 51015, 403);
        },
        get pingNotFound() {
            return new ApiError('errors.com.odysseus.party.pingNotFound', "Sorry, we couldn't find a ping.", 51021, 404);
        },
        get pingForbidden() {
            return new ApiError('errors.com.odysseus.party.pingForbidden', 'User is not authorized to send pings the desired user', 51020, 403);
        },
        get notYourAccount() {
            return new ApiError('errors.com.odysseus.party.notYourAccount', "You are not allowed to make changes to other people's accounts", 51023, 403);
        },
        get userOffline() {
            return new ApiError('errors.com.odysseus.party.userOffline', 'User is offline.', 51024, 403);
        },
        get selfPing() {
            return new ApiError('errors.com.odysseus.party.selfPing', 'Self pings are not allowed.', 51028, 400);
        },
        get selfInvite() {
            return new ApiError('errors.com.odysseus.party.selfInvite', 'Self invites are not allowed.', 51040, 400);
        }
    },
    cloudstorage: {
        get fileNotFound() {
            return new ApiError('errors.com.odysseus.cloudstorage.fileNotFound', 'Cannot find the file you requested.', 12004, 404);
        },
        get fileTooLarge() {
            return new ApiError('errors.com.odysseus.cloudstorage.fileTooLarge', 'The file you are trying to upload is too large', 12004, 413);
        },
        get invalidAuth() {
            return new ApiError('errors.com.odysseus.cloudstorage.invalidAuth', 'Invalid auth token', 12004, 401);
        },
        get invalidBody() {
            return new ApiError('errors.com.odysseus.cloudstorage.invalidBody', 'Invalid body', 12004, 400);
        }
    },
    account: {
        get disabledAccount() {
            return new ApiError('errors.com.odysseus.account.disabledAccount', 'Sorry, your account is disabled.', 18001, 403);
        },
        get invalidAccountIdCount() {
            return new ApiError('errors.com.odysseus.account.invalidAccountIdCount', 'Sorry, the number of account id should be at least one and not more than 100.', 18066, 400);
        },
        get accountNotFound() {
            return new ApiError('errors.com.odysseus.account.accountNotFound', "Sorry, we couldn't find an account for {0}", 18007, 404);
        }
    },
    mcp: {
        get operationFailed() {
            return new ApiError('errors.com.odysseus.mcp.operationFailed', 'Operation failed', 12800, 500);
        },
        get profileNotFound() {
            return new ApiError('errors.com.odysseus.mcp.profileNotFound', "Sorry, we couldn't find that profile for account with id {0}", 18007, 404);
        },
        get emptyItems() {
            return new ApiError('errors.com.odysseus.mcp.emptyItems', 'No items found', 12700, 404);
        },
        get notEnoughMtx() {
            return new ApiError('errors.com.odysseus.mcp.notEnoughMtx', 'Purchase: {0}: Required {1} MTX but account balance is only {2}.', 12720, 400);
        },
        get wrongCommand() {
            return new ApiError('errors.com.odysseus.mcp.wrongCommand', 'Wrong command.', 12801, 400);
        },
        get operationForbidden() {
            return new ApiError('errors.com.odysseus.mcp.operationForbidden', 'Operation Forbidden', 12813, 403);
        },
        get templateNotFound() {
            return new ApiError('errors.com.odysseus.mcp.templateNotFound', 'Unable to find template configuration for profile', 12813, 404);
        },
        get invalidHeader() {
            return new ApiError('errors.com.odysseus.mcp.invalidHeader', 'Parsing client revisions header failed.', 12831, 400);
        },
        get invalidPayload() {
            return new ApiError('errors.com.odysseus.mcp.invalidPayload', 'Unable to parse command', 12806, 400);
        },
        get missingPermission() {
            return new ApiError('errors.com.odysseus.mcp.missingPermission', "Sorry your login does not posses the permissions '{0} {1}' needed to perform the requested operation", 12806, 403);
        },
        get itemNotFound() {
            return new ApiError('errors.com.odysseus.mcp.itemNotFound', 'Locker item not found', 16006, 404);
        },
        wrongItemType(itemId: string, itemType: string) {
            return new ApiError('errors.com.odysseus.mcp.wrongItemType', `Item ${itemId} is not a ${itemType}`, 16009, 400);
        },
        get invalidChatRequest() {
            return new ApiError('errors.com.odysseus.mcp.invalidChatRequest', '', 16090, 400);
        },
        get operationNotFound() {
            return new ApiError('errors.com.odysseus.mcp.operationNotFound', 'Operation not found', 16035, 404);
        },
        get InvalidLockerSlotIndex() {
            return new ApiError('errors.com.odysseus.mcp.InvalidLockerSlotIndex', 'Invalid loadout index {0}, slot is empty', 16173, 400);
        },
        get outOfBounds() {
            return new ApiError('errors.com.odysseus.mcp.outOfBounds', 'Invalid loadout index (source: {0}, target: {1})', 16026, 400);
        }
    },
    gamecatalog: {
        get invalidParameter() {
            return new ApiError('errors.com.odysseus.gamecatalog.invalidParameter', 'PurchaseCatalogEntry cannot be used for RealMoney prices. Use VerifyRealMoneyPurchase flow instead.', 28000, 400);
        },
        itemNotFound(offerId: string) {
            return new ApiError('errors.com.odysseus.mcp.catalogOutOfDate', `Could not find catalog item ${offerId}`, 28001, 400, offerId);
        },
        priceMismatch(expectedPrice: number, actualPrice: number) {
            return new ApiError('errors.com.odysseus.mcp.catalogOutOfDate', `Expected total price of ${expectedPrice} did not match actual price ${actualPrice}`, 28001, 400, expectedPrice.toString(), actualPrice.toString());
        },
        priceNotFound(currency: string, currencySubType: string, offerId: string) {
            return new ApiError('errors.com.odysseus.mcp.catalogOutOfDate', `Could not find ${currency}-${currencySubType} price for catalog item ${offerId}`, 28001, 400, currency, currencySubType, offerId);
        },
        purchaseNotAllowed(devName: string, fulfillmentId: string, fulfillmentCount: number, fulfillmentLimit: number) {
            return new ApiError('errors.com.odysseus.gamecatalog.purchaseNotAllowed', `Could not purchase catalog offer ${devName} because fulfillment ${fulfillmentId} is owned ${fulfillmentCount} time(s) (exceeding the limit of ${fulfillmentLimit})`, 28004, 400);
        }
    },
    matchmaking: {
        get unknownSession() {
            return new ApiError('errors.com.odysseus.matchmaking.unknownSession', 'unknown session id', 12101, 404);
        },
        get missingCookie() {
            return new ApiError('errors.com.odysseus.matchmaking.missingCookie', 'Missing custom NetCL cookie', 1001, 400);
        },
        get invalidBucketId() {
            return new ApiError('errors.com.odysseus.matchmaking.invalidBucketId', 'blank or invalid bucketId', 16102, 400);
        },
        get invalidPartyPlayers() {
            return new ApiError('errors.com.odysseus.matchmaking.invalidPartyPlayers', 'blank or invalid partyPlayerIds', 16103, 400);
        },
        get invalidPlatform() {
            return new ApiError('errors.com.odysseus.matchmaking.invalidPlatform', 'invalid platform', 16104, 400);
        },
        get notAllowedIngame() {
            return new ApiError('errors.com.odysseus.matchmaking.notAllowedIngame', 'Player is not allowed to play in game due to equipping items they do not own', 16105, 400);
        }
    },
    friends: {
        get selfFriend() {
            return new ApiError('errors.com.odysseus.friends.selfFriend', 'You cannot be friend with yourself.', 14001, 400);
        },
        get accountNotFound() {
            return new ApiError('errors.com.odysseus.friends.accountNotFound', 'Account does not exist', 14011, 404);
        },
        get friendshipNotFound() {
            return new ApiError('errors.com.odysseus.friends.friendshipNotFound', 'Friendship does not exist', 14004, 404);
        },
        get requestAlreadySent() {
            return new ApiError('errors.com.odysseus.friends.requestAlreadySent', 'Friendship request has already been sent.', 14014, 409);
        },
        get invalidData() {
            return new ApiError('errors.com.odysseus.friends.invalidData', 'Invalid data', 14015, 400);
        }
    },
    internal: {
        get validationFailed() {
            return new ApiError('errors.com.odysseus.internal.validationFailed', 'Validation Failed. Invalid fields were {0}', 1040, 400);
        },
        get invalidUserAgent() {
            return new ApiError('errors.com.odysseus.internal.invalidUserAgent', 'The user-agent header you provided does not match a unreal engine formated user-agent', 16183, 400);
        },
        get serverError() {
            return new ApiError('errors.com.odysseus.internal.serverError', 'Sorry an error occurred and we were unable to resolve it.', 1000, 500);
        },
        get jsonParsingFailed() {
            return new ApiError('errors.com.odysseus.internal.jsonParsingFailed', 'Json parse failed.', 1020, 400);
        },
        get requestTimedOut() {
            return new ApiError('errors.com.odysseus.internal.requestTimedOut', 'Request timed out.', 1001, 408);
        },
        get unsupportedMediaType() {
            return new ApiError('errors.com.odysseus.internal.unsupportedMediaType', 'Sorry, your request could not be processed because you provide a type of media that we do not support.', 1006, 415);
        },
        get notImplemented() {
            return new ApiError('errors.com.odysseus.internal.notImplemented', 'The resource you were trying to access is not yet implemented by the server.', 1001, 501);
        },
        get dataBaseError() {
            return new ApiError('errors.com.odysseus.internal.dataBaseError', 'There was an error while interacting with the database. Please report this issue.', 1001, 500);
        },
        get unknownError() {
            return new ApiError('errors.com.odysseus.internal.unknownError', 'Sorry an error occurred and we were unable to resolve it.', 1001, 500);
        },
        get eosError() {
            return new ApiError('errors.com.odysseus.internal.EosError', 'Sorry an error occurred while communication with Odysseues Online Service Servers.', 1001, 500);
        }
    },
    basic: {
        get badRequest() {
            return new ApiError('errors.com.odysseus.basic.badRequest', 'Sorry but your request is invalid.', 1001, 400);
        },
        get notFound() {
            return new ApiError('errors.com.odysseus.basic.notFound', 'The resource you were trying to find could not be found.', 1004, 404);
        },
        get notAcceptable() {
            return new ApiError('errors.com.odysseus.basic.notAcceptable', 'Sorry your request could not be processed as you do not accept the response type generated by this resource. Please check your Accept header.', 1008, 406);
        },
        get methodNotAllowed() {
            return new ApiError('errors.com.odysseus.basic.methodNotAllowed', 'Sorry the resource you were trying to access cannot be accessed with the HTTP method you used.', 1009, 405);
        },
        get jsonMappingFailed() {
            return new ApiError('errors.com.odysseus.basic.jsonMappingFailed', 'Json mapping failed.', 1019, 400);
        },
        get throttled() {
            return new ApiError('errors.com.odysseus.basic.throttled', 'Operation access is limited by throttling policy.', 1041, 429);
        }
    },
    customError(code: string, message: string, numericErrorCode: number, status: number): ApiError {
        return new ApiError(code, message, numericErrorCode, status as HttpStatusCode);
    }
}

/**
 * 🚀 ODYSSEUS ERROR HANDLING - USAGE EXAMPLES
 * 
 * Basic usage:
 * ```typescript
 * const error = odysseus.authentication.invalidToken
 *   .withMessage('Custom message')
 *   .withSeverity('high')
 *   .withSuggestion('Please refresh your token')
 *   .withContext({ userId: '123' });
 * 
 * throw error.throwHttpException();
 * ```
 * 
 * Result pattern:
 * ```typescript
 * const result = await ErrorUtils.safeAsync(async () => {
 *   return await riskyOperation();
 * });
 * 
 * if (!result.success) {
 *   console.error('Operation failed:', result.error);
 *   return;
 * }
 * 
 * console.log('Success:', result.data);
 * ```
 * 
 * Retry with exponential backoff:
 * ```typescript
 * const result = await ErrorUtils.withRetry(
 *   () => callExternalAPI(),
 *   { maxAttempts: 3, baseDelay: 1000 }
 * );
 * ```
 * 
 * Error middleware:
 * ```typescript
 * app.use(createErrorMiddleware({
 *   enableDevMode: process.env.NODE_ENV === 'development',
 *   enableMetrics: true
 * }));
 * ```
 * 
 * Custom error factory:
 * ```typescript
 * const validationError = ErrorFactory.validation(
 *   'email',
 *   'invalid@',
 *   'must be a valid email address',
 *   ['Check the email format', 'Ensure @ symbol is present']
 * );
 * ```
 * 
 * Error boundary:
 * ```typescript
 * const boundary = ErrorBoundary.getInstance();
 * boundary.onError('authentication', (error) => {
 *   console.log('Auth error occurred:', error);
 *   // Send to monitoring service
 * });
 * ```
 */