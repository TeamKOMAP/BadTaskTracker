using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Infrastructure
{
    public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
    {
        public ApplicationDbContext CreateDbContext(string[] args)
        {
            var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();

            
            optionsBuilder.UseSqlite("Data Source=TaskManager.db");

            return new ApplicationDbContext(optionsBuilder.Options);
        }
    }
}