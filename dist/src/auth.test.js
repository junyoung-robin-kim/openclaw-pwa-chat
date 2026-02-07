import { describe, it, expect } from "vitest";
import { checkAuth, getGatewayToken } from "./auth.js";
describe("auth.ts — 인증 로직", () => {
    function mockRequest(overrides = {}) {
        return {
            headers: {},
            socket: { remoteAddress: "192.168.1.100" },
            url: "/",
            ...overrides,
        };
    }
    function mockConfig(token) {
        const cfg = {};
        if (token) {
            cfg.gateway = {
                auth: { token },
            };
        }
        return cfg;
    }
    describe("checkAuth", () => {
        it("Tailscale 헤더가 있으면 true", () => {
            const req = mockRequest({
                headers: { "tailscale-user-login": "user@example.com" },
            });
            expect(checkAuth(req, mockConfig())).toBe(true);
        });
        it("localhost IPv4 (127.0.0.1) 접근은 true", () => {
            const req = mockRequest({
                socket: { remoteAddress: "127.0.0.1" },
            });
            expect(checkAuth(req, mockConfig())).toBe(true);
        });
        it("localhost IPv6 (::1) 접근은 true", () => {
            const req = mockRequest({
                socket: { remoteAddress: "::1" },
            });
            expect(checkAuth(req, mockConfig())).toBe(true);
        });
        it("localhost IPv6 mapped IPv4 (::ffff:127.0.0.1) 접근은 true", () => {
            const req = mockRequest({
                socket: { remoteAddress: "::ffff:127.0.0.1" },
            });
            expect(checkAuth(req, mockConfig())).toBe(true);
        });
        it("토큰이 설정되지 않으면 모든 요청 허용", () => {
            const req = mockRequest({
                socket: { remoteAddress: "203.0.113.1" },
            });
            expect(checkAuth(req, mockConfig())).toBe(true);
        });
        it("Authorization 헤더로 올바른 토큰 전달 시 true", () => {
            const req = mockRequest({
                headers: { authorization: "Bearer secret123" },
                socket: { remoteAddress: "203.0.113.1" },
            });
            expect(checkAuth(req, mockConfig("secret123"))).toBe(true);
        });
        it("Authorization 헤더 (Bearer 없이) 올바른 토큰 전달 시 true", () => {
            const req = mockRequest({
                headers: { authorization: "secret123" },
                socket: { remoteAddress: "203.0.113.1" },
            });
            expect(checkAuth(req, mockConfig("secret123"))).toBe(true);
        });
        it("X-Auth-Token 헤더로 올바른 토큰 전달 시 true", () => {
            const req = mockRequest({
                headers: { "x-auth-token": "secret123" },
                socket: { remoteAddress: "203.0.113.1" },
            });
            expect(checkAuth(req, mockConfig("secret123"))).toBe(true);
        });
        it("쿼리 파라미터 token으로 올바른 토큰 전달 시 true", () => {
            const req = mockRequest({
                url: "/?token=secret123",
                headers: { host: "localhost:19999" },
                socket: { remoteAddress: "203.0.113.1" },
            });
            expect(checkAuth(req, mockConfig("secret123"))).toBe(true);
        });
        it("잘못된 토큰 전달 시 false", () => {
            const req = mockRequest({
                headers: { authorization: "Bearer wrong" },
                socket: { remoteAddress: "203.0.113.1" },
            });
            expect(checkAuth(req, mockConfig("secret123"))).toBe(false);
        });
        it("토큰 없이 외부 IP 접근 시 false", () => {
            const req = mockRequest({
                socket: { remoteAddress: "203.0.113.1" },
            });
            expect(checkAuth(req, mockConfig("secret123"))).toBe(false);
        });
    });
    describe("getGatewayToken", () => {
        it("토큰이 설정되어 있으면 반환", () => {
            expect(getGatewayToken(mockConfig("my-token"))).toBe("my-token");
        });
        it("토큰이 없으면 빈 문자열 반환", () => {
            expect(getGatewayToken(mockConfig())).toBe("");
        });
    });
});
