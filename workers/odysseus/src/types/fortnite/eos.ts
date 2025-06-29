export type EOS = {
	room: {
		roomId: string;
		participants: {
			puid: string;
			token: string;
			hardMuted: boolean;
		}[];
		deploymentId: string;
		clientBaseUrl: string;
	};

	oAuthToken: {
		access_token: string;
		token_type: string;
		expires_at: string;
		features: string[];
		organization_id: string;
		product_id: string;
		sandbox_id: string;
		deployment_id: string;
		expires_in: number;
	};

	ApiError: {
		messageVars: string[];
		errorMessage: string;
		errorCode: string;
		correlationId: string;
		numericErrorCode: number;
		responseStatus: number;
		intent: string;
		originatingService: string;
	};
};
