namespace Bala.Shared;

public class ApiResponse<T>
{
    public bool Success { get; init; }
    public T? Data { get; init; }
    public ApiError? Error { get; init; }
    public ApiMeta Meta { get; init; } = new();

    public static ApiResponse<T> Ok(T data) => new()
    {
        Success = true,
        Data = data,
        Error = null,
        Meta = ApiMeta.Create()
    };

    public static ApiResponse<T> Fail(string code, string message, object? details = null) => new()
    {
        Success = false,
        Data = default,
        Error = new ApiError { Code = code, Message = message, Details = details },
        Meta = ApiMeta.Create()
    };
}

public class ApiError
{
    public string Code { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public object? Details { get; set; }
}

public class ApiMeta
{
    public string RequestId { get; set; } = Guid.NewGuid().ToString();
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    public static ApiMeta Create() => new()
    {
        RequestId = Guid.NewGuid().ToString(),
        Timestamp = DateTime.UtcNow
    };
}
