import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRealtimeStore } from "@/stores/realtime.store";

// ─── Mock QueryClient ───
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

// ─── Mock import.meta.env ───
vi.stubEnv("VITE_WS_URL", "ws://localhost:8000/api/v1/ws");

// ─── WebSocket Mock ───
type WSHandler = (event?: any) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = 0; // CONNECTING
  onopen: WSHandler | null = null;
  onmessage: WSHandler | null = null;
  onclose: WSHandler | null = null;
  onerror: WSHandler | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  send(_data: string) {}

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  simulateError() {
    if (this.onerror) this.onerror();
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }
}

// Assign to global
const originalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  MockWebSocket.instances = [];
  (globalThis as any).WebSocket = MockWebSocket;
  vi.useFakeTimers();

  // Reset the realtime store between tests
  useRealtimeStore.setState({
    status: "disconnected",
    lastMessage: null,
  });
});

afterEach(() => {
  (globalThis as any).WebSocket = originalWebSocket;
  vi.useRealTimers();
  vi.clearAllMocks();
});

// Dynamically import after mocks are set up
async function importHook() {
  // Clear module cache to get fresh import with mocks
  vi.resetModules();
  const mod = await import("./use-task-websocket");
  return mod.useTaskWebSocket;
}

describe("useTaskWebSocket", () => {
  it("connects to WebSocket with the task ID", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toContain("taskId=task-abc");
  });

  it("sets status to connecting on init", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    expect(useRealtimeStore.getState().status).toBe("connecting");
  });

  it("sets status to connected on open", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(useRealtimeStore.getState().status).toBe("connected");
  });

  it("parses and stores incoming messages", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    const message = { type: "state_change", status: "in_progress", progress: 50 };
    act(() => {
      MockWebSocket.instances[0].simulateMessage(message);
    });

    expect(useRealtimeStore.getState().lastMessage).toEqual(message);
  });

  it("invalidates queries on state_change message", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: "state_change",
        status: "in_progress",
      });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["tasks", "task-abc"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["tasks"],
    });
  });

  it("invalidates queries on completed message", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      MockWebSocket.instances[0].simulateMessage({ type: "completed" });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["tasks", "task-abc"],
    });
  });

  it("invalidates queries on error message", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: "error",
        errorCode: "TIMEOUT",
      });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["tasks", "task-abc"],
    });
  });

  it("does not invalidate queries for other message types", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    mockInvalidateQueries.mockClear();

    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: "heartbeat",
      });
    });

    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it("ignores malformed JSON messages", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Send malformed message directly through onmessage
    act(() => {
      if (MockWebSocket.instances[0].onmessage) {
        MockWebSocket.instances[0].onmessage({
          data: "not-json{{{",
        });
      }
    });

    // Should not throw, lastMessage should remain null or previous
    expect(useRealtimeStore.getState().lastMessage).toBeNull();
  });

  // ─── Reconnection ───

  it("sets status to disconnected on close", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });

    expect(useRealtimeStore.getState().status).toBe("disconnected");
  });

  it("reconnects with exponential backoff after close", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    // First connection
    expect(MockWebSocket.instances.length).toBe(1);

    // Close triggers reconnect timer (1s delay for first retry)
    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });

    expect(MockWebSocket.instances.length).toBe(1); // Not yet reconnected

    // Advance timer by 1 second (first retry delay = 1000 * 2^0 = 1s)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockWebSocket.instances.length).toBe(2); // Reconnected
  });

  it("increases reconnect delay exponentially", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    // First close -> 1s delay
    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances.length).toBe(2);

    // Second close -> 2s delay
    act(() => {
      MockWebSocket.instances[1].simulateClose();
    });

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(MockWebSocket.instances.length).toBe(2); // Not yet

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(MockWebSocket.instances.length).toBe(3); // Now reconnected
  });

  it("resets reconnect counter on successful connection", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    // Close and reconnect
    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Open the new connection (resets counter)
    act(() => {
      MockWebSocket.instances[1].simulateOpen();
    });

    // Close again -> should be back to 1s delay (counter was reset)
    act(() => {
      MockWebSocket.instances[1].simulateClose();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances.length).toBe(3);
  });

  it("closes WebSocket on error", async () => {
    const useTaskWebSocket = await importHook();

    renderHook(() => useTaskWebSocket("task-abc"));

    const closeSpy = vi.spyOn(MockWebSocket.instances[0], "close");

    act(() => {
      MockWebSocket.instances[0].simulateError();
    });

    expect(closeSpy).toHaveBeenCalled();
  });

  // ─── Cleanup ───

  it("cleans up WebSocket on unmount", async () => {
    const useTaskWebSocket = await importHook();

    const { unmount } = renderHook(() => useTaskWebSocket("task-abc"));

    const closeSpy = vi.spyOn(MockWebSocket.instances[0], "close");

    unmount();

    expect(closeSpy).toHaveBeenCalled();
  });

  it("clears reconnect timer on unmount", async () => {
    const useTaskWebSocket = await importHook();

    const { unmount } = renderHook(() => useTaskWebSocket("task-abc"));

    // Close to start reconnect timer
    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });

    unmount();

    // Advance past the reconnect delay -- should NOT create a new connection
    const countBefore = MockWebSocket.instances.length;
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(MockWebSocket.instances.length).toBe(countBefore);
  });
});
