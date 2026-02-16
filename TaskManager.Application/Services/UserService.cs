using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;

namespace TaskManager.Application.Services
{
    public class UserService : IUserService
    {
        private readonly IUserRepository _userRepository;

        public UserService(IUserRepository userRepository)
        {
            _userRepository = userRepository;
        }

        public async Task<IEnumerable<UserDto>> GetUsersAsync(string? query = null)
        {
            var users = await _userRepository.GetAllAsync(query);
            var counts = await _userRepository.GetTaskCountsAsync(users.Select(x => x.Id));

            return users.Select(user => MapToDto(user, counts.TryGetValue(user.Id, out var taskCount) ? taskCount : 0));
        }

        public async Task<UserDto> GetUserByIdAsync(int id)
        {
            var user = await _userRepository.GetByIdAsync(id);
            if (user == null)
            {
                throw new NotFoundException($"User with id {id} not found");
            }

            var taskCount = await _userRepository.GetTaskCountAsync(user.Id);
            return MapToDto(user, taskCount);
        }

        public async Task<UserDto> CreateUserAsync(CreateUserDto dto)
        {
            var email = dto.Email.Trim();
            if (string.IsNullOrWhiteSpace(email))
            {
                throw new ValidationException("Email is required");
            }

            var name = string.IsNullOrWhiteSpace(dto.Name)
                ? email.Split('@')[0]
                : dto.Name.Trim();

            var exists = await _userRepository.EmailExistsAsync(email);
            if (exists)
            {
                throw new ConflictException("User with this email already exists");
            }

            var user = new User
            {
                Name = name,
                Email = email,
                CreatedAt = DateTime.UtcNow
            };

            var created = await _userRepository.AddAsync(user);
            return MapToDto(created, 0);
        }

        private static UserDto MapToDto(User user, int taskCount)
        {
            return new UserDto
            {
                Id = user.Id,
                Name = user.Name,
                Email = user.Email,
                CreatedAt = user.CreatedAt,
                TaskCount = taskCount
            };
        }
    }
}
