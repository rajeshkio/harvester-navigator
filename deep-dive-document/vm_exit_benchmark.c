#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <fcntl.h>
#include <sys/ioctl.h>
#include <linux/kvm.h>
#include <sys/mman.h>
#include <unistd.h>
#include <stdint.h>

int main() {
    int kvm_fd = open("/dev/kvm", O_RDWR | O_CLOEXEC);
    int vm_fd = ioctl(kvm_fd, KVM_CREATE_VM, 0);
    
    size_t mem_size = 0x1000;
    void *guest_memory = mmap(NULL, mem_size, PROT_READ | PROT_WRITE,
                              MAP_SHARED | MAP_ANONYMOUS, -1, 0);
    
    // Code that does 1000 I/O operations then halts
    unsigned char *code = (unsigned char *)guest_memory;
    int i = 0;
    
    // mov $1000, %cx (loop counter)
    code[i++] = 0xb9; code[i++] = 0xe8; code[i++] = 0x03;
    
    // loop_start: mov $0xe9, %dx
    int loop_start = i;
    code[i++] = 0xba; code[i++] = 0xe9; code[i++] = 0x00;
    
    // mov $'X', %al; out %al, %dx
    code[i++] = 0xb0; code[i++] = 'X'; code[i++] = 0xee;
    
    // dec %cx; jnz loop_start
    code[i++] = 0x49;
    code[i++] = 0x75;
    code[i++] = loop_start - (i + 1); // relative jump
    
    // hlt
    code[i++] = 0xf4;
    
    struct kvm_userspace_memory_region mem_region = {
        .slot = 0, .guest_phys_addr = 0x1000, .memory_size = mem_size,
        .userspace_addr = (uint64_t)guest_memory
    };
    ioctl(vm_fd, KVM_SET_USER_MEMORY_REGION, &mem_region);
    
    int vcpu_fd = ioctl(vm_fd, KVM_CREATE_VCPU, 0);
    int vcpu_mmap_size = ioctl(kvm_fd, KVM_GET_VCPU_MMAP_SIZE, 0);
    struct kvm_run *run = mmap(NULL, vcpu_mmap_size, PROT_READ | PROT_WRITE,
                               MAP_SHARED, vcpu_fd, 0);
    
    struct kvm_sregs sregs;
    ioctl(vcpu_fd, KVM_GET_SREGS, &sregs);
    sregs.cs.base = 0; sregs.cs.limit = 0xffff; sregs.cs.selector = 0;
    ioctl(vcpu_fd, KVM_SET_SREGS, &sregs);
    
    struct kvm_regs regs = {0};
    regs.rip = 0x1000; regs.rflags = 0x2;
    ioctl(vcpu_fd, KVM_SET_REGS, &regs);
    
    printf("Benchmarking VM exit overhead...\n");
    
    struct timespec start, end;
    clock_gettime(CLOCK_MONOTONIC, &start);
    
    int exit_count = 0;
    while (1) {
        ioctl(vcpu_fd, KVM_RUN, 0);
        
        if (run->exit_reason == KVM_EXIT_HLT) {
            break;
        } else if (run->exit_reason == KVM_EXIT_IO) {
            exit_count++;
        }
    }
    
    clock_gettime(CLOCK_MONOTONIC, &end);
    
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_nsec - start.tv_nsec) / 1e9;
    
    printf("VM exits: %d\n", exit_count);
    printf("Total time: %.6f seconds\n", elapsed);
    printf("Average per VM exit: %.2f microseconds\n", 
           (elapsed * 1e6) / exit_count);
    
    close(vcpu_fd); close(vm_fd); close(kvm_fd);
    munmap(guest_memory, mem_size); munmap(run, vcpu_mmap_size);
    return 0;
}
